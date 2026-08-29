package setting

import (
	"os"
	"strconv"
	"strings"
)

// Prompt review is an optional semantic second pass for text prompts. The
// internal bearer token is intentionally environment-only and never exported
// through the administrator options API.
var (
	PromptReviewEnabled         = false
	PromptReviewModel           = "gpt-5.6-luna"
	PromptReviewReasoningEffort = "low"
	PromptReviewBaseURL         = "http://127.0.0.1:3000"
	PromptReviewTimeoutMs       = 1500
	PromptReviewBlockThreshold  = 0.85
	PromptReviewFailMode        = "block_on_keyword"
	PromptReviewToken           = strings.TrimSpace(os.Getenv("PROMPT_REVIEW_TOKEN"))
	PromptReviewInternalSecret  = strings.TrimSpace(os.Getenv("PROMPT_REVIEW_INTERNAL_SECRET"))
)

func PromptReviewTokenFromEnvironment() string {
	if token := strings.TrimSpace(os.Getenv("PROMPT_REVIEW_TOKEN")); token != "" {
		return token
	}
	return PromptReviewToken
}

func PromptReviewInternalSecretFromEnvironment() string {
	if secret := strings.TrimSpace(os.Getenv("PROMPT_REVIEW_INTERNAL_SECRET")); secret != "" {
		return secret
	}
	return PromptReviewInternalSecret
}

func PromptReviewTimeout() int {
	if PromptReviewTimeoutMs < 250 {
		return 250
	}
	if PromptReviewTimeoutMs > 10000 {
		return 10000
	}
	return PromptReviewTimeoutMs
}

func PromptReviewThreshold() float64 {
	if PromptReviewBlockThreshold < 0.5 {
		return 0.5
	}
	if PromptReviewBlockThreshold > 1 {
		return 1
	}
	return PromptReviewBlockThreshold
}

func NormalizePromptReviewReasoningEffort(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "low", "medium", "high":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "low"
	}
}

func NormalizePromptReviewFailMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "block", "block_on_keyword", "allow":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "block_on_keyword"
	}
}

func PromptReviewTimeoutString() string {
	return strconv.Itoa(PromptReviewTimeoutMs)
}
