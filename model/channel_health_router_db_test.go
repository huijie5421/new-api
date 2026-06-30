package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 复现 2026-06-30 生产事故场景并验证修复：
// GPT PRO号池 + gpt-5.5 的优先级分层（仅列 enabled 渠道）：
//
//	priority 5: #90        （最高层，唯一渠道——事故中被健康路由排除）
//	priority 4: #49, #89
//	priority 2: #76
//	priority 1: #16, #79, #81
//
// 事故 bug：排除 #90（最高层唯一渠道）后，DB 路径无法降级到 priority 4 层，
// 导致选回 #90 或直接「No available channel」503。
func seedHealthRouterAbilities(t *testing.T) {
	t.Helper()
	DB.Exec("DELETE FROM abilities")
	DB.Exec("DELETE FROM channels")

	p := func(v int64) *int64 { return &v }
	channels := []Channel{
		{Id: 90, Status: common.ChannelStatusEnabled, Priority: p(5)},
		{Id: 49, Status: common.ChannelStatusEnabled, Priority: p(4)},
		{Id: 89, Status: common.ChannelStatusEnabled, Priority: p(4)},
		{Id: 76, Status: common.ChannelStatusEnabled, Priority: p(2)},
		{Id: 16, Status: common.ChannelStatusEnabled, Priority: p(1)},
		{Id: 79, Status: common.ChannelStatusEnabled, Priority: p(1)},
		{Id: 81, Status: common.ChannelStatusEnabled, Priority: p(1)},
	}
	for i := range channels {
		require.NoError(t, DB.Create(&channels[i]).Error)
	}
	abilities := []Ability{
		{Group: "g", Model: "m", ChannelId: 90, Enabled: true, Priority: p(5)},
		{Group: "g", Model: "m", ChannelId: 49, Enabled: true, Priority: p(4)},
		{Group: "g", Model: "m", ChannelId: 89, Enabled: true, Priority: p(4)},
		{Group: "g", Model: "m", ChannelId: 76, Enabled: true, Priority: p(2)},
		{Group: "g", Model: "m", ChannelId: 16, Enabled: true, Priority: p(1)},
		{Group: "g", Model: "m", ChannelId: 79, Enabled: true, Priority: p(1)},
		{Group: "g", Model: "m", ChannelId: 81, Enabled: true, Priority: p(1)},
	}
	for i := range abilities {
		require.NoError(t, DB.Create(&abilities[i]).Error)
	}
	t.Cleanup(func() {
		DB.Exec("DELETE FROM abilities")
		DB.Exec("DELETE FROM channels")
	})
}

// 核心回归：排除最高层唯一渠道 #90，必须降级到 priority 4 层(#49/#89)，
// 既不能选回 #90，也不能返回 nil（事故根因）。
func TestGetChannelExcluding_DegradesToNextTier(t *testing.T) {
	seedHealthRouterAbilities(t)

	for i := 0; i < 50; i++ {
		ch, err := GetChannelExcluding("g", "m", 0, map[int]bool{90: true})
		require.NoError(t, err)
		require.NotNil(t, ch, "排除最高层唯一渠道后不应返回 nil（事故根因：No available channel）")
		assert.NotEqual(t, 90, ch.Id, "被排除的 #90 不应再被选中")
		assert.Contains(t, []int{49, 89}, ch.Id, "应降级到 priority 4 层 #49/#89")
	}
}

// 排除最高两层（5 与 4 的全部）后，应继续降级到 priority 2 的 #76。
func TestGetChannelExcluding_DegradesAcrossMultipleTiers(t *testing.T) {
	seedHealthRouterAbilities(t)

	exclude := map[int]bool{90: true, 49: true, 89: true}
	for i := 0; i < 30; i++ {
		ch, err := GetChannelExcluding("g", "m", 0, exclude)
		require.NoError(t, err)
		require.NotNil(t, ch)
		assert.Equal(t, 76, ch.Id, "排除 priority 5 与 4 后应落到 priority 2 的 #76")
	}
}

// 全部渠道被排除时，回退为不排除（保可用），而非返回 nil 致 503。
func TestGetChannelExcluding_AllExcludedFallsBack(t *testing.T) {
	seedHealthRouterAbilities(t)

	all := map[int]bool{90: true, 49: true, 89: true, 76: true, 16: true, 79: true, 81: true}
	ch, err := GetChannelExcluding("g", "m", 0, all)
	require.NoError(t, err)
	require.NotNil(t, ch, "全部排除时应回退为不排除，保证可用而非 503")
	assert.Equal(t, 90, ch.Id, "回退后按原优先级应选最高层 #90")
}

// exclude 为空时，行为与原 GetChannel 一致（选最高优先级层 #90）。
func TestGetChannelExcluding_NoExcludeMatchesOriginal(t *testing.T) {
	seedHealthRouterAbilities(t)

	ch, err := GetChannelExcluding("g", "m", 0, nil)
	require.NoError(t, err)
	require.NotNil(t, ch)
	assert.Equal(t, 90, ch.Id, "无排除应选最高优先级层 #90")
}
