package relay

import (
	"errors"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

const responsesWSHalfOpenRetryGuard = time.Minute

type responsesWSBreakerState struct {
	loaded        bool
	disabledUntil int64
	probing       bool
	guardUntil    int64
}

type responsesWSBreakerManager struct {
	mu     sync.Mutex
	states map[int]*responsesWSBreakerState
	load   func(int) (*model.ChannelResponsesWSBreaker, error)
	trip   func(int, string, string, time.Time) error
	clear  func(int) error
}

func newResponsesWSBreakerManager() *responsesWSBreakerManager {
	return &responsesWSBreakerManager{
		states: make(map[int]*responsesWSBreakerState),
		load:   model.GetChannelResponsesWSBreaker,
		trip:   model.TripChannelResponsesWSBreaker,
		clear:  model.ClearChannelResponsesWSBreaker,
	}
}

var globalResponsesWSBreakerManager = newResponsesWSBreakerManager()

// begin returns whether WS may be attempted and whether this attempt owns the
// single half-open probe lease for an expired persisted cooldown.
func (manager *responsesWSBreakerManager) begin(channelID int, now time.Time) (allowed bool, probe bool, disabledUntil int64) {
	if channelID <= 0 {
		return true, false, 0
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()

	state := manager.states[channelID]
	if state == nil {
		state = &responsesWSBreakerState{}
		manager.states[channelID] = state
	}
	if !state.loaded {
		breaker, err := manager.load(channelID)
		if err == nil && breaker != nil {
			state.disabledUntil = breaker.DisabledUntil
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			// A storage outage must not disable a configured transport. Runtime
			// failures remain request-scoped until persistence is healthy again.
			return true, false, 0
		}
		state.loaded = true
	}
	if !responsesWSCircuitAllows(state.disabledUntil, now) {
		return false, false, state.disabledUntil
	}
	if state.disabledUntil > 0 {
		if state.probing || state.guardUntil > now.Unix() {
			return false, false, state.disabledUntil
		}
		state.probing = true
		return true, true, state.disabledUntil
	}
	return true, false, 0
}

func (manager *responsesWSBreakerManager) unsupported(channelID int, reasonCode, reasonDetail string, now time.Time) {
	if channelID <= 0 {
		return
	}
	disabledUntil := now.Add(model.ResponsesWSUnsupportedCooldown).Unix()
	manager.mu.Lock()
	state := manager.states[channelID]
	if state == nil {
		state = &responsesWSBreakerState{}
		manager.states[channelID] = state
	}
	state.loaded = true
	state.disabledUntil = disabledUntil
	state.probing = false
	state.guardUntil = 0
	manager.mu.Unlock()
	_ = manager.trip(channelID, reasonCode, reasonDetail, now)
}

func (manager *responsesWSBreakerManager) success(channelID int, probe bool) {
	if channelID <= 0 || !probe {
		return
	}
	manager.mu.Lock()
	state := manager.states[channelID]
	if state != nil {
		state.loaded = true
		state.disabledUntil = 0
		state.probing = false
		state.guardUntil = 0
	}
	manager.mu.Unlock()
	_ = manager.clear(channelID)
}

func (manager *responsesWSBreakerManager) transient(channelID int, probe bool, now time.Time) {
	if channelID <= 0 || !probe {
		return
	}
	manager.mu.Lock()
	if state := manager.states[channelID]; state != nil {
		state.probing = false
		state.guardUntil = now.Add(responsesWSHalfOpenRetryGuard).Unix()
	}
	manager.mu.Unlock()
}
