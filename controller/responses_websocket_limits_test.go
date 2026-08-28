package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponsesWSConnectionLimiter(t *testing.T) {
	limiter := newResponsesWSConnectionLimiter()

	releaseFirst, ok := limiter.acquire(101, 2)
	require.True(t, ok)
	releaseSecond, ok := limiter.acquire(101, 2)
	require.True(t, ok)
	_, ok = limiter.acquire(101, 2)
	assert.False(t, ok)

	releaseOther, ok := limiter.acquire(202, 2)
	require.True(t, ok, "different token IDs must use independent capacity")
	releaseOther()

	releaseFirst()
	releaseAfterFree, ok := limiter.acquire(101, 2)
	require.True(t, ok)
	releaseAfterFree()
	releaseSecond()

	releaseUnlimited, ok := limiter.acquire(101, 0)
	require.True(t, ok, "zero disables the connection cap")
	releaseUnlimited()

	assert.Empty(t, limiter.counts)
}

func TestResponsesWSConnectionLimiterReleaseIsIdempotent(t *testing.T) {
	limiter := newResponsesWSConnectionLimiter()
	release, ok := limiter.acquire(303, 1)
	require.True(t, ok)

	release()
	release()

	releaseAgain, ok := limiter.acquire(303, 1)
	require.True(t, ok)
	releaseAgain()
	assert.Empty(t, limiter.counts)
}
