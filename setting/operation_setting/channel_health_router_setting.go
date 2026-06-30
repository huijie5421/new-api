package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// ChannelHealthRouterSetting 渠道自动健康路由配置。
//
// 设计文档：docs/channel-health-router-design.md（v2，已用生产数据校准）。
//
// 核心思路：
//   - 按分组开启（EnabledGroups），只有列入的分组才参与自动健康路由。
//   - 健康定义复用 new-api 内置色标（绝对 UX 标准）：首字延迟 / 流速，取两者最差。
//   - 渠道健康 = 最近 WindowSize 次请求中“红色（明确差体验）”的计数。
//   - 红色计数分带：<=WarnRedCnt 正常；[Warn,Bad) 早警探测；>=BadRedCnt 且连续
//     ConfirmWindows 窗确认 → 判 BAD，从选路候选软排除并冷却。
//   - 不健康渠道按 priority 临时降级（在 model 选路层被排除，流量落到同层其它
//     渠道或下一优先级层），源渠道恢复后自动回归低成本。
type ChannelHealthRouterSetting struct {
	// Enabled 总开关。关闭时所有 hook 短路，行为与原生完全一致。默认关，保守上线。
	Enabled bool `json:"enabled"`

	// EnabledGroups 开启自动健康路由的分组名集合（group 即渠道的 group 字段，
	// 权威列表来自 ratio_setting.GetGroupRatioCopy()）。仅这些分组生效。
	EnabledGroups []string `json:"enabled_groups"`

	// WindowSize 健康观测窗口大小（最近 N 次请求，计数窗口）。
	WindowSize int `json:"window_size"`

	// ---- 原子评级阈值（对齐内置色标 web/.../usage-logs/lib/format.ts）----
	// 首字延迟（毫秒）：< Yellow 绿，[Yellow,Red) 黄，>= Red 红。
	FrtYellowMs int `json:"frt_yellow_ms"`
	FrtRedMs    int `json:"frt_red_ms"`
	// 流速（tok/s，仅当输出 token >= TpsMinOutputTokens 时按流速判，否则按总时长判）：
	// >= Green 绿，[Yellow,Green) 黄，< Yellow 红。
	TpsYellow          int `json:"tps_yellow"`
	TpsGreen           int `json:"tps_green"`
	TpsMinOutputTokens int `json:"tps_min_output_tokens"`
	// 总时长（秒，输出 token 不足时使用）：< Yellow 绿，[Yellow,Red) 黄，>= Red 红。
	DurationYellowSec int `json:"duration_yellow_sec"`
	DurationRedSec    int `json:"duration_red_sec"`
	// NoFirstByteIsRed 流式请求未观测到首字（无 TTFB）是否计红。
	NoFirstByteIsRed bool `json:"no_first_byte_is_red"`

	// ---- 红色计数分带（窗口 = WindowSize）----
	WarnRedCnt      int `json:"warn_red_cnt"`      // >= 触发 WARN（探测）
	BadRedCnt       int `json:"bad_red_cnt"`       // >= 触发 BAD（需连续确认）
	ConfirmWindows  int `json:"confirm_windows"`   // BAD 连续确认窗数
	RecoverOKStreak int `json:"recover_ok_streak"` // PROBING → OK 所需连续健康探测窗数

	// ---- 冷却 + 探测 ----
	CooldownSeconds    int     `json:"cooldown_seconds"`     // 基础冷却（秒）
	CooldownMaxSeconds int     `json:"cooldown_max_seconds"` // 退避上限（秒）
	CooldownBackoff    float64 `json:"cooldown_backoff"`     // 退避倍率
	ProbeRatio         float64 `json:"probe_ratio"`          // PROBING/WARN 探测分流比例
	CanaryRatio        float64 `json:"canary_ratio"`         // 状态未知备用渐进放量比例

	// ---- 与渠道亲和协作 ----
	// VetoAffinityOnBad 渠道处于 BAD 时是否否决亲和（放弃缓存局部性切走）。
	// 仅 BAD 否决；WARN/黄色不否决，避免为一点延迟丢上游 prompt 缓存。
	VetoAffinityOnBad bool `json:"veto_affinity_on_bad"`

	// ---- 错误率（次要/可选）----
	// CollectErrorRate 是否把渠道侧错误（失败请求）计入红色。用户已开亲和自动重试，
	// 报错会自动切且多为偶发瞬时，故默认关；开启后失败请求直接计红参与判定。
	CollectErrorRate bool `json:"collect_error_rate"`
}

// 默认值：全部由生产 gpt-5.5 数据校准（详见设计文档 §2/§3）。
// EnabledGroups 默认开启三个分组（名称逐字对齐生产 channels.group，已用 hex 校验）：
// GPT PRO号池 / GPT RPO订阅专用 / GPT PLUS极速版。
var channelHealthRouterSetting = ChannelHealthRouterSetting{
	Enabled: true,
	EnabledGroups: []string{
		"GPT PRO号池",
		"GPT RPO订阅专用",
		"GPT PLUS极速版",
	},

	WindowSize: 20,

	FrtYellowMs: 5000,
	FrtRedMs:    10000,

	TpsYellow:          15,
	TpsGreen:           30,
	TpsMinOutputTokens: 100,

	DurationYellowSec: 10,
	DurationRedSec:    30,

	NoFirstByteIsRed: true,

	WarnRedCnt:      3,
	BadRedCnt:       6,
	ConfirmWindows:  3,
	RecoverOKStreak: 3,

	CooldownSeconds:    900,   // 15 分钟
	CooldownMaxSeconds: 14400, // 4 小时
	CooldownBackoff:    2.0,
	ProbeRatio:         0.08,
	CanaryRatio:        0.05,

	VetoAffinityOnBad: true,

	CollectErrorRate: false,
}

func init() {
	config.GlobalConfig.Register("channel_health_router_setting", &channelHealthRouterSetting)
}

func GetChannelHealthRouterSetting() *ChannelHealthRouterSetting {
	return &channelHealthRouterSetting
}

// IsHealthRouterEnabledForGroup 判断某分组是否开启自动健康路由。
// 总开关关闭、或分组不在 EnabledGroups 中，均返回 false。
func IsHealthRouterEnabledForGroup(group string) bool {
	if !channelHealthRouterSetting.Enabled {
		return false
	}
	if group == "" {
		return false
	}
	for _, g := range channelHealthRouterSetting.EnabledGroups {
		if strings.TrimSpace(g) == group {
			return true
		}
	}
	return false
}
