package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

const (
	channelCapacityWindow       = time.Minute
	channelCapacityLeaseTTL     = 2 * time.Minute
	channelCapacityRenewEvery   = 30 * time.Second
	channelCapacityRedisTimeout = 2 * time.Second
	channelCapacityNamespace    = "channelCapacity:v1"
)

type ChannelCapacityReason string

const (
	ChannelCapacityReasonConcurrency ChannelCapacityReason = "concurrency"
	ChannelCapacityReasonRPM         ChannelCapacityReason = "rpm"
)

type ChannelCapacityDecision struct {
	Allowed           bool
	Reason            ChannelCapacityReason
	RetryAfterSeconds int64
}

type ChannelCapacityLease struct {
	once    sync.Once
	release func()
}

func (lease *ChannelCapacityLease) Release() {
	if lease == nil {
		return
	}
	lease.once.Do(func() {
		if lease.release != nil {
			lease.release()
		}
	})
}

type localChannelCapacityState struct {
	active     int
	acceptedAt []int64
}

type channelCapacityManager struct {
	mu           sync.Mutex
	local        map[int]*localChannelCapacityState
	now          func() time.Time
	newLeaseID   func() string
	redisEnabled func() bool
	redisClient  func() *redis.Client
}

func newChannelCapacityManager() *channelCapacityManager {
	return &channelCapacityManager{
		local:      make(map[int]*localChannelCapacityState),
		now:        time.Now,
		newLeaseID: uuid.NewString,
		redisEnabled: func() bool {
			return common.RedisEnabled && common.RDB != nil
		},
		redisClient: func() *redis.Client {
			return common.RDB
		},
	}
}

var globalChannelCapacityManager = newChannelCapacityManager()

func AcquireChannelCapacity(ctx context.Context, channelID int, settings dto.ChannelSettings) (*ChannelCapacityLease, ChannelCapacityDecision, error) {
	return globalChannelCapacityManager.acquire(ctx, channelID, settings)
}

func (manager *channelCapacityManager) acquire(ctx context.Context, channelID int, settings dto.ChannelSettings) (*ChannelCapacityLease, ChannelCapacityDecision, error) {
	if channelID <= 0 {
		return nil, ChannelCapacityDecision{}, errors.New("channel id must be positive")
	}
	if err := settings.ValidateCapacityLimits(); err != nil {
		return nil, ChannelCapacityDecision{}, err
	}
	if settings.MaxConcurrentRequests == 0 && settings.RequestsPerMinute == 0 {
		return &ChannelCapacityLease{}, ChannelCapacityDecision{Allowed: true}, nil
	}
	if manager.redisEnabled != nil && manager.redisEnabled() {
		return manager.acquireRedis(ctx, channelID, settings)
	}
	return manager.acquireLocal(channelID, settings)
}

func (manager *channelCapacityManager) acquireLocal(channelID int, settings dto.ChannelSettings) (*ChannelCapacityLease, ChannelCapacityDecision, error) {
	nowMillis := manager.now().UnixMilli()
	windowStart := nowMillis - channelCapacityWindow.Milliseconds()

	manager.mu.Lock()
	state := manager.local[channelID]
	if state == nil {
		state = &localChannelCapacityState{}
		manager.local[channelID] = state
	}
	firstCurrent := 0
	for firstCurrent < len(state.acceptedAt) && state.acceptedAt[firstCurrent] <= windowStart {
		firstCurrent++
	}
	if firstCurrent > 0 {
		state.acceptedAt = append(state.acceptedAt[:0], state.acceptedAt[firstCurrent:]...)
	}

	if settings.MaxConcurrentRequests > 0 && state.active >= settings.MaxConcurrentRequests {
		manager.mu.Unlock()
		return nil, ChannelCapacityDecision{
			Reason:            ChannelCapacityReasonConcurrency,
			RetryAfterSeconds: 1,
		}, nil
	}
	if settings.RequestsPerMinute > 0 && len(state.acceptedAt) >= settings.RequestsPerMinute {
		retryAfter := retryAfterSeconds(state.acceptedAt[0]+channelCapacityWindow.Milliseconds()-nowMillis, time.Millisecond)
		manager.mu.Unlock()
		return nil, ChannelCapacityDecision{
			Reason:            ChannelCapacityReasonRPM,
			RetryAfterSeconds: retryAfter,
		}, nil
	}

	if settings.MaxConcurrentRequests > 0 {
		state.active++
	}
	if settings.RequestsPerMinute > 0 {
		state.acceptedAt = append(state.acceptedAt, nowMillis)
	}
	manager.mu.Unlock()

	lease := &ChannelCapacityLease{}
	if settings.MaxConcurrentRequests > 0 {
		lease.release = func() {
			manager.mu.Lock()
			if current := manager.local[channelID]; current != nil && current.active > 0 {
				current.active--
			}
			manager.mu.Unlock()
		}
	}
	return lease, ChannelCapacityDecision{Allowed: true}, nil
}

const acquireChannelCapacityRedisScript = `
local now = tonumber(ARGV[1])
local max_concurrency = tonumber(ARGV[2])
local rpm = tonumber(ARGV[3])
local lease_id = ARGV[4]
local lease_ttl = tonumber(ARGV[5])
local window = tonumber(ARGV[6])

if max_concurrency > 0 then
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
  if redis.call('ZCARD', KEYS[1]) >= max_concurrency then
    return {0, 1, 1000}
  end
end

if rpm > 0 then
  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - window)
  if redis.call('ZCARD', KEYS[2]) >= rpm then
    local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
    local retry_after = 1000
    if oldest[2] then
      retry_after = math.max(1, tonumber(oldest[2]) + window - now)
    end
    return {0, 2, retry_after}
  end
end

if max_concurrency > 0 then
  redis.call('ZADD', KEYS[1], now + lease_ttl, lease_id)
  redis.call('PEXPIRE', KEYS[1], lease_ttl * 2)
end
if rpm > 0 then
  redis.call('ZADD', KEYS[2], now, lease_id)
  redis.call('PEXPIRE', KEYS[2], window * 2)
end
return {1, 0, 0}
`

const renewChannelCapacityRedisScript = `
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  redis.call('ZADD', KEYS[1], 'XX', ARGV[2], ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return 1
end
return 0
`

func (manager *channelCapacityManager) acquireRedis(ctx context.Context, channelID int, settings dto.ChannelSettings) (*ChannelCapacityLease, ChannelCapacityDecision, error) {
	client := manager.redisClient()
	if client == nil {
		return nil, ChannelCapacityDecision{}, errors.New("Redis client is not initialized")
	}
	leaseID := manager.newLeaseID()
	nowMillis := manager.now().UnixMilli()
	concurrencyKey := fmt.Sprintf("%s:concurrency:%d", channelCapacityNamespace, channelID)
	rpmKey := fmt.Sprintf("%s:rpm:%d", channelCapacityNamespace, channelID)
	values, err := client.Eval(
		ctx,
		acquireChannelCapacityRedisScript,
		[]string{concurrencyKey, rpmKey},
		nowMillis,
		settings.MaxConcurrentRequests,
		settings.RequestsPerMinute,
		leaseID,
		channelCapacityLeaseTTL.Milliseconds(),
		channelCapacityWindow.Milliseconds(),
	).Slice()
	if err != nil {
		return nil, ChannelCapacityDecision{}, fmt.Errorf("acquire channel capacity: %w", err)
	}
	if len(values) != 3 {
		return nil, ChannelCapacityDecision{}, fmt.Errorf("unexpected channel capacity reply length %d", len(values))
	}
	allowed, err := channelCapacityRedisInteger(values[0])
	if err != nil {
		return nil, ChannelCapacityDecision{}, err
	}
	reasonValue, err := channelCapacityRedisInteger(values[1])
	if err != nil {
		return nil, ChannelCapacityDecision{}, err
	}
	retryMillis, err := channelCapacityRedisInteger(values[2])
	if err != nil {
		return nil, ChannelCapacityDecision{}, err
	}
	if allowed == 0 {
		reason := ChannelCapacityReasonConcurrency
		if reasonValue == 2 {
			reason = ChannelCapacityReasonRPM
		}
		return nil, ChannelCapacityDecision{
			Reason:            reason,
			RetryAfterSeconds: retryAfterSeconds(retryMillis, time.Millisecond),
		}, nil
	}

	lease := &ChannelCapacityLease{}
	if settings.MaxConcurrentRequests == 0 {
		return lease, ChannelCapacityDecision{Allowed: true}, nil
	}
	renewContext, cancelRenew := context.WithCancel(context.Background())
	go manager.renewRedisLease(renewContext, client, concurrencyKey, leaseID)
	lease.release = func() {
		cancelRenew()
		releaseContext, cancel := context.WithTimeout(context.Background(), channelCapacityRedisTimeout)
		defer cancel()
		if err := client.ZRem(releaseContext, concurrencyKey, leaseID).Err(); err != nil {
			common.SysError("release channel capacity: " + err.Error())
		}
	}
	return lease, ChannelCapacityDecision{Allowed: true}, nil
}

func (manager *channelCapacityManager) renewRedisLease(ctx context.Context, client *redis.Client, key, leaseID string) {
	ticker := time.NewTicker(channelCapacityRenewEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			renewContext, cancel := context.WithTimeout(ctx, channelCapacityRedisTimeout)
			nowMillis := manager.now().UnixMilli()
			err := client.Eval(
				renewContext,
				renewChannelCapacityRedisScript,
				[]string{key},
				leaseID,
				nowMillis+channelCapacityLeaseTTL.Milliseconds(),
				(channelCapacityLeaseTTL * 2).Milliseconds(),
			).Err()
			cancel()
			if err != nil && !errors.Is(err, context.Canceled) {
				common.SysError("renew channel capacity: " + err.Error())
			}
		}
	}
}

func channelCapacityRedisInteger(value any) (int64, error) {
	switch typed := value.(type) {
	case int64:
		return typed, nil
	case string:
		return strconv.ParseInt(typed, 10, 64)
	case []byte:
		return strconv.ParseInt(string(typed), 10, 64)
	default:
		return 0, fmt.Errorf("unexpected Redis integer reply type %T", value)
	}
}

func retryAfterSeconds(value int64, unit time.Duration) int64 {
	duration := time.Duration(value) * unit
	seconds := int64((duration + time.Second - 1) / time.Second)
	if seconds < 1 {
		return 1
	}
	return seconds
}
