package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSeedDefaultChannelMonitorTemplatesAddsImageModesIdempotently(t *testing.T) {
	previousDB := DB
	t.Cleanup(func() { DB = previousDB })

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	require.NoError(t, db.AutoMigrate(&ChannelMonitorRequestTemplate{}))

	require.NoError(t, SeedDefaultChannelMonitorTemplates())
	require.NoError(t, SeedDefaultChannelMonitorTemplates())

	for _, provider := range []string{"openai", "grok"} {
		var template ChannelMonitorRequestTemplate
		require.NoError(t, db.Where("provider = ? AND api_mode = ?", provider, "image_generation").First(&template).Error)
		require.Equal(t, "auto", template.BodyMode)
		require.JSONEq(t, `{"n":1,"size":"1024x1024"}`, template.Body)
	}
	var count int64
	require.NoError(t, db.Model(&ChannelMonitorRequestTemplate{}).Where("api_mode = ?", "image_generation").Count(&count).Error)
	require.Equal(t, int64(2), count)
}
