package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// This fixture models a running instance being upgraded in place: existing
// options are written before startup migration and must remain byte-for-byte
// unchanged while retained additive tables are created idempotently.
func TestSlimMigrationPreservesExistingSettings(t *testing.T) {
	previousDB := DB
	previousLogDB := LOG_DB
	previousMainType := common.MainDatabaseType()
	previousLogType := common.LogDatabaseType()
	previousMaster := common.IsMasterNode
	previousRedis := common.RedisEnabled
	t.Cleanup(func() {
		DB = previousDB
		LOG_DB = previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		common.IsMasterNode = previousMaster
		common.RedisEnabled = previousRedis
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.IsMasterNode = true
	common.RedisEnabled = false
	require.NoError(t, db.AutoMigrate(&Option{}))

	existing := []Option{
		{Key: "PayAddress", Value: "https://pay.example.test"},
		{Key: "EpayId", Value: "merchant-legacy"},
		{Key: "EpayKey", Value: "secret-legacy"},
		{Key: "GMPayAddress", Value: "https://gmpay.example.test"},
		{Key: "GMPayId", Value: "gmpay-legacy"},
		{Key: "GMPayKey", Value: "gmpay-secret"},
		{Key: "GMPayPayMethods", Value: `[{"type":"usdt","name":"USDT"}]`},
		{Key: "HeaderNavModules", Value: `{"about":true}`},
	}
	require.NoError(t, db.Create(&existing).Error)

	require.NoError(t, migrateDB())
	require.NoError(t, migrateDB())

	for _, want := range existing {
		var got Option
		require.NoError(t, db.Where("key = ?", want.Key).First(&got).Error)
		require.Equal(t, want.Value, got.Value, want.Key)
	}
	for _, table := range []string{
		"channel_monitors",
		"channel_monitor_histories",
		"channel_monitor_daily_rollups",
		"channel_monitor_request_templates",
		"channel_monitor_aggregation_watermarks",
		"affiliate_rebate_records",
	} {
		require.True(t, db.Migrator().HasTable(table), table)
	}
}
