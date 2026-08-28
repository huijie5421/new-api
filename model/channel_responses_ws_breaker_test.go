package model

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestChannelResponsesWSBreakerLifecycleAndIsolation(t *testing.T) {
	previousDB := DB
	t.Cleanup(func() { DB = previousDB })

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	require.NoError(t, db.AutoMigrate(&ChannelResponsesWSBreaker{}))

	now := time.Unix(10_000, 0)
	require.NoError(t, TripChannelResponsesWSBreaker(7, "unsupported_transport", "explicit upstream rejection", now))

	breaker, err := GetChannelResponsesWSBreaker(7)
	require.NoError(t, err)
	require.Equal(t, now.Add(24*time.Hour).Unix(), breaker.DisabledUntil)
	require.Equal(t, "unsupported_transport", breaker.ReasonCode)

	channels := []*Channel{{Id: 7}, {Id: 8}}
	require.NoError(t, AttachChannelResponsesWSBreakers(channels))
	require.NotNil(t, channels[0].ResponsesWSBreaker)
	require.Nil(t, channels[1].ResponsesWSBreaker)

	_, err = GetChannelResponsesWSBreaker(8)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	require.NoError(t, ClearChannelResponsesWSBreaker(7))
	_, err = GetChannelResponsesWSBreaker(7)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}
