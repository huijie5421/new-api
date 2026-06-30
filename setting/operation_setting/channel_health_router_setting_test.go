package operation_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 验证软开关：通过 config.UpdateConfigFromMap（即生产 handleConfigUpdate 的底层机制）
// 把 channel_health_router_setting.enabled 设为 false 后，IsHealthRouterEnabledForGroup
// 必须立即返回 false——这是「出问题一键关」的依赖。2026-06-30 事故中软开关疑似未生效，
// 此测试锁定该机制可用。
func TestHealthRouter_SoftSwitchViaConfig(t *testing.T) {
	// 保存并在结束时恢复全局配置，避免污染其它测试。
	saved := channelHealthRouterSetting
	t.Cleanup(func() { channelHealthRouterSetting = saved })

	// 初始：开启 + 含分组 g。
	channelHealthRouterSetting.Enabled = true
	channelHealthRouterSetting.EnabledGroups = []string{"g"}
	assert.True(t, IsHealthRouterEnabledForGroup("g"), "前置：g 应已开启")

	cfg := config.GlobalConfig.Get("channel_health_router_setting")
	require.NotNil(t, cfg, "配置必须已注册（init 注册），否则 handleConfigUpdate 会 return false 致软开关失效")

	// 模拟运营改 options 表 enabled=false 后的运行时下发。
	require.NoError(t, config.UpdateConfigFromMap(cfg, map[string]string{"enabled": "false"}))
	assert.False(t, IsHealthRouterEnabledForGroup("g"), "软关闭后必须立即对所有分组返回 false")

	// 再开回来，确认可逆。
	require.NoError(t, config.UpdateConfigFromMap(cfg, map[string]string{"enabled": "true"}))
	assert.True(t, IsHealthRouterEnabledForGroup("g"), "重新开启后应恢复")
}

// 验证按分组开关 + enabled_groups 经 config 下发（slice 字段 JSON 往返）。
func TestHealthRouter_EnabledGroupsViaConfig(t *testing.T) {
	saved := channelHealthRouterSetting
	t.Cleanup(func() { channelHealthRouterSetting = saved })

	channelHealthRouterSetting.Enabled = true
	channelHealthRouterSetting.EnabledGroups = []string{"GPT PRO号池"}

	assert.True(t, IsHealthRouterEnabledForGroup("GPT PRO号池"))
	assert.False(t, IsHealthRouterEnabledForGroup("GPT PLUS号池"), "未列入的分组不应开启")
	assert.False(t, IsHealthRouterEnabledForGroup(""), "空分组名不应开启")

	cfg := config.GlobalConfig.Get("channel_health_router_setting")
	require.NotNil(t, cfg)
	// 运行时改 enabled_groups（slice 走 JSON 反序列化）。
	require.NoError(t, config.UpdateConfigFromMap(cfg, map[string]string{"enabled_groups": `["GPT PLUS极速版"]`}))
	assert.True(t, IsHealthRouterEnabledForGroup("GPT PLUS极速版"))
	assert.False(t, IsHealthRouterEnabledForGroup("GPT PRO号池"), "改组后旧分组应关闭")
}
