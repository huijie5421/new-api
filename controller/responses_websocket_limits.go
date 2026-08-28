package controller

import "sync"

type responsesWSConnectionLimiter struct {
	mu     sync.Mutex
	counts map[int]int
}

func newResponsesWSConnectionLimiter() *responsesWSConnectionLimiter {
	return &responsesWSConnectionLimiter{counts: make(map[int]int)}
}

func (l *responsesWSConnectionLimiter) acquire(tokenID int, maxConnections int) (func(), bool) {
	if maxConnections == 0 {
		return func() {}, true
	}

	l.mu.Lock()
	if l.counts[tokenID] >= maxConnections {
		l.mu.Unlock()
		return nil, false
	}
	l.counts[tokenID]++
	l.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Lock()
			defer l.mu.Unlock()
			if l.counts[tokenID] <= 1 {
				delete(l.counts, tokenID)
				return
			}
			l.counts[tokenID]--
		})
	}, true
}

var globalResponsesWSConnectionLimiter = newResponsesWSConnectionLimiter()
