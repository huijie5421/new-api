package operation_setting

import (
	"encoding/json"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// ClaudeCodeSpoofSetting 全局「Claude Code 伪装」配置。
//
// 部分 Anthropic 上游（如 Claude Max 套餐线路）会校验请求是否来自官方 Claude Code
// CLI，非官方客户端会被降级到第三方额度甚至拒绝。要让渠道监控的 /v1/messages 探测
// 请求被识别为官方 CLI，需要同时满足四要素：
//  1. 头：User-Agent(claude-cli/x.y.z)、X-App、anthropic-beta、anthropic-version
//  2. system 数组首项与官方 system prompt 字面一致（上游按 Dice 相似度判定）
//  3. metadata.user_id 满足官方格式（legacy: user_<64hex>_account_<uuid>_session_<36char>）
//
// 该配置为全局默认值，渠道监控可按线路开启 cc_spoof_enabled 引用本配置注入。
type ClaudeCodeSpoofSetting struct {
	// Enabled 仅作为全局默认开关的占位（当前由各监控的 cc_spoof_enabled 控制注入），
	// 保留以便将来扩展为"全局强制对所有 anthropic 监控生效"。
	Enabled bool `json:"enabled"`
	// UserAgent 伪装的 CLI User-Agent，版本号需与真实 CLI 对齐。
	UserAgent string `json:"user_agent"`
	// AnthropicBeta anthropic-beta 头，逗号分隔的 beta token 列表。
	AnthropicBeta string `json:"anthropic_beta"`
	// AnthropicVersion anthropic-version 头。
	AnthropicVersion string `json:"anthropic_version"`
	// XApp X-App 头，官方 CLI 固定为 "cli"。
	XApp string `json:"x_app"`
	// ExtraHeaders 额外注入的请求头（JSON 对象字符串），如 X-Stainless-* 系列。
	ExtraHeaders string `json:"extra_headers"`
	// SystemPrompt 注入到 system 数组首项的文本，需与官方 system prompt 字面一致。
	SystemPrompt string `json:"system_prompt"`
	// MetadataUserID 注入到 body.metadata.user_id 的值，需满足官方格式校验。
	MetadataUserID string `json:"metadata_user_id"`
	// OverrideUserSystem 为 true 时仅用伪装 system（忽略用户自定义 system）；
	// 为 false 时把伪装 system 插到首位、用户已有 system 接其后。
	OverrideUserSystem bool `json:"override_user_system"`
}

// 默认配置：对齐 sub2api internal/pkg/claude/constants.go 的最新值（截至 2026-04 抓包）。
var claudeCodeSpoofSetting = ClaudeCodeSpoofSetting{
	Enabled:          false,
	UserAgent:        "claude-cli/2.1.161 (external, cli)",
	AnthropicBeta:    "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05,effort-2025-11-24,context-management-2025-06-27,extended-cache-ttl-2025-04-11",
	AnthropicVersion: "2023-06-01",
	XApp:             "cli",
	ExtraHeaders:     `{"X-Stainless-Lang":"js","X-Stainless-Package-Version":"0.94.0","X-Stainless-OS":"Linux","X-Stainless-Arch":"arm64","X-Stainless-Runtime":"node","X-Stainless-Runtime-Version":"v24.3.0","X-Stainless-Retry-Count":"0","X-Stainless-Timeout":"600","Anthropic-Dangerous-Direct-Browser-Access":"true"}`,
	SystemPrompt:     "You are Claude Code, Anthropic's official CLI for Claude.",
	// legacy 占位格式：64 个 hex + account UUID + session 36char，可被官方校验通过且便于阅读。
	MetadataUserID:     "user_0000000000000000000000000000000000000000000000000000000000000000_account_00000000-0000-0000-0000-000000000000_session_00000000-0000-0000-0000-000000000000",
	OverrideUserSystem: false,
}

func init() {
	config.GlobalConfig.Register("claude_code_spoof_setting", &claudeCodeSpoofSetting)
}

// GetClaudeCodeSpoofSetting 返回全局 Claude Code 伪装配置。
func GetClaudeCodeSpoofSetting() *ClaudeCodeSpoofSetting {
	return &claudeCodeSpoofSetting
}

// SpoofHeaders 组装需要注入的请求头：固定四要素 + ExtraHeaders 中的额外头。
// 返回的 map 可直接覆盖/合并到适配器默认头之上。
func (s *ClaudeCodeSpoofSetting) SpoofHeaders() map[string]string {
	headers := make(map[string]string)
	// 先注入额外头，再用固定四要素覆盖，保证关键头不被 ExtraHeaders 意外改写。
	if strings.TrimSpace(s.ExtraHeaders) != "" {
		var extra map[string]string
		if err := json.Unmarshal([]byte(s.ExtraHeaders), &extra); err == nil {
			for k, v := range extra {
				headers[k] = v
			}
		}
	}
	if s.UserAgent != "" {
		headers["User-Agent"] = s.UserAgent
	}
	if s.XApp != "" {
		headers["X-App"] = s.XApp
	}
	if s.AnthropicBeta != "" {
		headers["anthropic-beta"] = s.AnthropicBeta
	}
	if s.AnthropicVersion != "" {
		headers["anthropic-version"] = s.AnthropicVersion
	}
	return headers
}
