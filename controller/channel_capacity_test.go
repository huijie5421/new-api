package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelCapacityControllerTest(t *testing.T) *gorm.DB {
	t.Helper()
	originalDB := model.DB
	originalMemoryCache := common.MemoryCacheEnabled
	originalRedisEnabled := common.RedisEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))
	model.DB = db
	common.MemoryCacheEnabled = true
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = originalDB
		common.MemoryCacheEnabled = originalMemoryCache
		common.RedisEnabled = originalRedisEnabled
		if originalMemoryCache && originalDB != nil && originalDB.Migrator().HasTable(&model.Channel{}) {
			model.InitChannelCache()
		}
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
	return db
}

func createCapacityControllerChannel(t *testing.T, db *gorm.DB, id int, group, modelName string) *model.Channel {
	t.Helper()
	priority := int64(0)
	weight := uint(100)
	channel := &model.Channel{
		Id:       id,
		Type:     constant.ChannelTypeOpenAI,
		Key:      fmt.Sprintf("key-%d", id),
		Status:   common.ChannelStatusEnabled,
		Name:     fmt.Sprintf("channel-%d", id),
		Models:   modelName,
		Group:    group,
		Priority: &priority,
		Weight:   &weight,
	}
	channel.SetSetting(dto.ChannelSettings{MaxConcurrentRequests: 1})
	require.NoError(t, db.Create(channel).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: group, Model: modelName, ChannelId: id, Enabled: true, Priority: &priority, Weight: weight,
	}).Error)
	return channel
}

func newCapacityControllerContext(channel *model.Channel, modelName string) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	common.SetContextKey(c, constant.ContextKeyChannelId, channel.Id)
	common.SetContextKey(c, constant.ContextKeyChannelName, channel.Name)
	common.SetContextKey(c, constant.ContextKeyChannelType, channel.Type)
	common.SetContextKey(c, constant.ContextKeyChannelSetting, channel.GetSetting())
	common.SetContextKey(c, constant.ContextKeyUsingGroup, channel.Group)
	common.SetContextKey(c, constant.ContextKeyOriginalModel, modelName)
	return c
}

func TestGetChannelWithCapacityMovesToAnotherChannelInSameGroup(t *testing.T) {
	db := setupChannelCapacityControllerTest(t)
	const modelName = "capacity-controller-model"
	first := createCapacityControllerChannel(t, db, 91_001, "vip", modelName)
	second := createCapacityControllerChannel(t, db, 91_002, "vip", modelName)
	model.InitChannelCache()

	held, decision, err := service.AcquireChannelCapacity(t.Context(), first.Id, first.GetSetting())
	require.NoError(t, err)
	require.True(t, decision.Allowed)
	defer held.Release()

	c := newCapacityControllerContext(first, modelName)
	retry := 0
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		OriginModelName: modelName,
		TokenGroup:      "vip",
	}
	selected, lease, apiErr := getChannelWithCapacity(c, info, &service.RetryParam{
		Ctx: c, TokenGroup: "vip", ModelName: modelName, RequestPath: c.Request.URL.Path, Retry: &retry,
	})
	require.Nil(t, apiErr)
	require.NotNil(t, lease)
	defer lease.Release()
	assert.Equal(t, second.Id, selected.Id)
	assert.Equal(t, second.Id, common.GetContextKeyInt(c, constant.ContextKeyChannelId))
}

func TestGetChannelWithCapacityKeepsSpecificChannelBinding(t *testing.T) {
	db := setupChannelCapacityControllerTest(t)
	const modelName = "capacity-specific-channel-model"
	first := createCapacityControllerChannel(t, db, 92_001, "vip", modelName)
	createCapacityControllerChannel(t, db, 92_002, "vip", modelName)
	model.InitChannelCache()

	held, decision, err := service.AcquireChannelCapacity(t.Context(), first.Id, first.GetSetting())
	require.NoError(t, err)
	require.True(t, decision.Allowed)
	defer held.Release()

	c := newCapacityControllerContext(first, modelName)
	c.Set("specific_channel_id", fmt.Sprintf("%d", first.Id))
	retry := 0
	info := &relaycommon.RelayInfo{OriginModelName: modelName, TokenGroup: "vip"}
	selected, lease, apiErr := getChannelWithCapacity(c, info, &service.RetryParam{
		Ctx: c, TokenGroup: "vip", ModelName: modelName, RequestPath: c.Request.URL.Path, Retry: &retry,
	})
	assert.Nil(t, selected)
	assert.Nil(t, lease)
	require.NotNil(t, apiErr)
	assert.Equal(t, types.ErrorCodeChannelCapacityExceeded, apiErr.GetErrorCode())
	assert.Equal(t, http.StatusServiceUnavailable, apiErr.StatusCode)
	assert.Equal(t, "1", c.Writer.Header().Get("Retry-After"))
}

func TestGetChannelWithCapacityDoesNotCrossGroupWhenAllCandidatesAreFull(t *testing.T) {
	db := setupChannelCapacityControllerTest(t)
	const modelName = "capacity-full-group-model"
	first := createCapacityControllerChannel(t, db, 93_001, "vip", modelName)
	second := createCapacityControllerChannel(t, db, 93_002, "vip", modelName)
	createCapacityControllerChannel(t, db, 93_003, "default", modelName)
	model.InitChannelCache()

	firstLease, firstDecision, err := service.AcquireChannelCapacity(t.Context(), first.Id, first.GetSetting())
	require.NoError(t, err)
	require.True(t, firstDecision.Allowed)
	defer firstLease.Release()
	secondLease, secondDecision, err := service.AcquireChannelCapacity(t.Context(), second.Id, second.GetSetting())
	require.NoError(t, err)
	require.True(t, secondDecision.Allowed)
	defer secondLease.Release()

	c := newCapacityControllerContext(first, modelName)
	retry := 0
	info := &relaycommon.RelayInfo{OriginModelName: modelName, TokenGroup: "vip"}
	selected, lease, apiErr := getChannelWithCapacity(c, info, &service.RetryParam{
		Ctx: c, TokenGroup: "vip", ModelName: modelName, RequestPath: c.Request.URL.Path, Retry: &retry,
	})
	assert.Nil(t, selected)
	assert.Nil(t, lease)
	require.NotNil(t, apiErr)
	assert.Equal(t, types.ErrorCodeChannelCapacityExceeded, apiErr.GetErrorCode())
	assert.NotEqual(t, 93_003, common.GetContextKeyInt(c, constant.ContextKeyChannelId), "another group must never be selected for capacity overflow")
}
