package model

import (
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetUserInviteeCountExcludesSoftDeletedUsers(t *testing.T) {
	truncateTables(t)

	inviter := &User{Username: "count-inviter", Password: "password", AffCode: "count-inviter", AffCount: 1}
	require.NoError(t, DB.Create(inviter).Error)
	require.NoError(t, DB.Create(&User{Username: "count-live-1", Password: "password", AffCode: "count-live-1", InviterId: inviter.Id}).Error)
	require.NoError(t, DB.Create(&User{Username: "count-live-2", Password: "password", AffCode: "count-live-2", InviterId: inviter.Id}).Error)
	deleted := &User{Username: "count-deleted", Password: "password", AffCode: "count-deleted", InviterId: inviter.Id}
	require.NoError(t, DB.Create(deleted).Error)
	require.NoError(t, DB.Delete(deleted).Error)

	count, err := GetUserInviteeCount(inviter.Id)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)
}

func TestRefreshAffiliateCountRepairsCompatibilityCounter(t *testing.T) {
	truncateTables(t)

	inviter := &User{Username: "refresh-inviter", Password: "password", AffCode: "refresh-inviter", AffCount: 99}
	require.NoError(t, DB.Create(inviter).Error)
	require.NoError(t, DB.Create(&User{Username: "refresh-live", Password: "password", AffCode: "refresh-live", InviterId: inviter.Id}).Error)

	require.NoError(t, RefreshAffiliateCount(inviter.Id))

	var refreshed User
	require.NoError(t, DB.First(&refreshed, inviter.Id).Error)
	require.Equal(t, 1, refreshed.AffCount)
}

func TestRefreshAffiliateCountRejectsMissingInviter(t *testing.T) {
	require.ErrorIs(t, RefreshAffiliateCount(987654321), gorm.ErrRecordNotFound)
}
