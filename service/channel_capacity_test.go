package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLocalChannelCapacityEnforcesConcurrencyAndReleases(t *testing.T) {
	now := time.Unix(1_000, 0)
	manager := newChannelCapacityManager()
	manager.now = func() time.Time { return now }
	manager.redisEnabled = func() bool { return false }
	settings := dto.ChannelSettings{MaxConcurrentRequests: 1}

	first, decision, err := manager.acquire(t.Context(), 7, settings)
	require.NoError(t, err)
	require.True(t, decision.Allowed)

	second, decision, err := manager.acquire(t.Context(), 7, settings)
	require.NoError(t, err)
	assert.Nil(t, second)
	assert.False(t, decision.Allowed)
	assert.Equal(t, ChannelCapacityReasonConcurrency, decision.Reason)
	assert.EqualValues(t, 1, decision.RetryAfterSeconds)

	first.Release()
	third, decision, err := manager.acquire(t.Context(), 7, settings)
	require.NoError(t, err)
	require.True(t, decision.Allowed)
	third.Release()
}

func TestLocalChannelCapacityUsesRollingRPMWindowAndIsolatesChannels(t *testing.T) {
	now := time.Unix(2_000, 0)
	manager := newChannelCapacityManager()
	manager.now = func() time.Time { return now }
	manager.redisEnabled = func() bool { return false }
	settings := dto.ChannelSettings{RequestsPerMinute: 2}

	for range 2 {
		lease, decision, err := manager.acquire(t.Context(), 11, settings)
		require.NoError(t, err)
		require.True(t, decision.Allowed)
		lease.Release()
	}

	lease, decision, err := manager.acquire(t.Context(), 11, settings)
	require.NoError(t, err)
	assert.Nil(t, lease)
	assert.False(t, decision.Allowed)
	assert.Equal(t, ChannelCapacityReasonRPM, decision.Reason)
	assert.EqualValues(t, 60, decision.RetryAfterSeconds)

	other, decision, err := manager.acquire(t.Context(), 12, settings)
	require.NoError(t, err)
	require.True(t, decision.Allowed, "a full channel must not consume another channel's limit")
	other.Release()

	now = now.Add(30 * time.Second)
	_, decision, err = manager.acquire(t.Context(), 11, settings)
	require.NoError(t, err)
	assert.EqualValues(t, 30, decision.RetryAfterSeconds)

	now = now.Add(31 * time.Second)
	afterWindow, decision, err := manager.acquire(t.Context(), 11, settings)
	require.NoError(t, err)
	require.True(t, decision.Allowed)
	afterWindow.Release()
}

func TestRedisChannelCapacitySharesAtomicConcurrencyAndRPM(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })

	now := time.Unix(3_000, 0)
	leaseSequence := 0
	manager := newChannelCapacityManager()
	manager.now = func() time.Time { return now }
	manager.redisEnabled = func() bool { return true }
	manager.redisClient = func() *redis.Client { return client }
	manager.newLeaseID = func() string {
		leaseSequence++
		return fmt.Sprintf("lease-%d", leaseSequence)
	}
	settings := dto.ChannelSettings{MaxConcurrentRequests: 1, RequestsPerMinute: 2}

	first, decision, err := manager.acquire(context.Background(), 21, settings)
	require.NoError(t, err)
	require.True(t, decision.Allowed)

	_, decision, err = manager.acquire(context.Background(), 21, settings)
	require.NoError(t, err)
	assert.False(t, decision.Allowed)
	assert.Equal(t, ChannelCapacityReasonConcurrency, decision.Reason)

	first.Release()
	second, decision, err := manager.acquire(context.Background(), 21, settings)
	require.NoError(t, err)
	require.True(t, decision.Allowed)
	second.Release()

	_, decision, err = manager.acquire(context.Background(), 21, settings)
	require.NoError(t, err)
	assert.False(t, decision.Allowed)
	assert.Equal(t, ChannelCapacityReasonRPM, decision.Reason)
	assert.EqualValues(t, 60, decision.RetryAfterSeconds)

	now = now.Add(61 * time.Second)
	afterWindow, decision, err := manager.acquire(context.Background(), 21, settings)
	require.NoError(t, err)
	require.True(t, decision.Allowed)
	afterWindow.Release()
}

func TestChannelCapacityDisabledDoesNotCreateState(t *testing.T) {
	manager := newChannelCapacityManager()
	manager.redisEnabled = func() bool { return false }

	lease, decision, err := manager.acquire(t.Context(), 31, dto.ChannelSettings{})
	require.NoError(t, err)
	require.True(t, decision.Allowed)
	lease.Release()
	assert.Empty(t, manager.local)
}
