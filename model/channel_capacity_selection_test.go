package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetChannelExcludingWorksWithoutMemoryCache(t *testing.T) {
	originalDB := DB
	originalMemoryCache := common.MemoryCacheEnabled
	originalDatabaseType := common.MainDatabaseType()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
	DB = db
	common.MemoryCacheEnabled = false
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	initCol()
	t.Cleanup(func() {
		DB = originalDB
		common.MemoryCacheEnabled = originalMemoryCache
		common.SetMainDatabaseType(originalDatabaseType)
		initCol()
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})

	modelName := "db-capacity-model"
	highPriority := int64(10)
	lowPriority := int64(0)
	weight := uint(100)
	for _, fixture := range []struct {
		id       int
		priority *int64
	}{
		{id: 81_001, priority: &highPriority},
		{id: 81_002, priority: &lowPriority},
	} {
		require.NoError(t, db.Create(&Channel{
			Id: fixture.id, Type: constant.ChannelTypeOpenAI, Key: "key", Status: common.ChannelStatusEnabled,
			Name: fmt.Sprintf("channel-%d", fixture.id), Models: modelName, Group: "vip", Priority: fixture.priority, Weight: &weight,
		}).Error)
		require.NoError(t, db.Create(&Ability{
			Group: "vip", Model: modelName, ChannelId: fixture.id, Enabled: true, Priority: fixture.priority, Weight: weight,
		}).Error)
	}

	selected, err := GetChannelExcluding("vip", modelName, 0, "/v1/chat/completions", map[int]struct{}{81_001: {}})
	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, 81_002, selected.Id)

	selected, err = GetChannelExcluding("vip", modelName, 0, "/v1/chat/completions", map[int]struct{}{81_001: {}, 81_002: {}})
	require.NoError(t, err)
	assert.Nil(t, selected)
}
