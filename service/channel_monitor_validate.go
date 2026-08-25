package service

import (
	"fmt"
	"net/url"
	"strings"
)

// ValidateMonitorConfig validates monitor configuration
func ValidateMonitorConfig(provider string, apiMode string, endpoint string, apiKey string, primaryModel string, intervalSeconds int, timeoutSeconds int) error {
	// Validate provider
	if provider != ProviderOpenAI && provider != ProviderAnthropic && provider != ProviderGemini {
		return fmt.Errorf("invalid provider: %s (must be openai, anthropic, or gemini)", provider)
	}

	// Validate API mode for OpenAI
	if provider == ProviderOpenAI {
		if apiMode != APIModeChat && apiMode != APIModeResponses {
			return fmt.Errorf("invalid api_mode for OpenAI: %s (must be chat_completions or responses)", apiMode)
		}
	}

	// Validate endpoint
	if err := ValidateEndpoint(endpoint); err != nil {
		return err
	}

	// Validate endpoint URL structure
	parsedURL, err := url.Parse(endpoint)
	if err != nil {
		return fmt.Errorf("invalid endpoint URL: %w", err)
	}

	// Check for SSRF before allowing configuration
	if err := ResolveAndCheckHost(parsedURL.Hostname()); err != nil {
		return fmt.Errorf("endpoint validation failed: %w", err)
	}

	// Validate API key
	if strings.TrimSpace(apiKey) == "" {
		return fmt.Errorf("api_key cannot be empty")
	}

	// Validate primary model
	if strings.TrimSpace(primaryModel) == "" {
		return fmt.Errorf("primary_model cannot be empty")
	}

	// Validate interval
	if intervalSeconds < MinCheckInterval {
		return fmt.Errorf("interval_seconds must be at least %d seconds", MinCheckInterval)
	}
	if intervalSeconds > MaxCheckInterval {
		return fmt.Errorf("interval_seconds must not exceed %d seconds", MaxCheckInterval)
	}

	// Validate timeout
	if timeoutSeconds < 1 {
		return fmt.Errorf("timeout_seconds must be at least 1 second")
	}
	if timeoutSeconds > MaxCheckTimeout {
		return fmt.Errorf("timeout_seconds must not exceed %d seconds", MaxCheckTimeout)
	}
	if timeoutSeconds >= intervalSeconds {
		return fmt.Errorf("timeout_seconds must be less than interval_seconds")
	}

	return nil
}

// ValidateTemplateConfig validates template configuration
func ValidateTemplateConfig(provider string, name string, bodyMode string) error {
	// Validate provider
	if provider != ProviderOpenAI && provider != ProviderAnthropic && provider != ProviderGemini {
		return fmt.Errorf("invalid provider: %s", provider)
	}

	// Validate name
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("name cannot be empty")
	}

	// Validate body mode
	if bodyMode != BodyModeAuto && bodyMode != BodyModeMinimal && bodyMode != BodyModeCustom {
		return fmt.Errorf("invalid body_mode: %s (must be auto, minimal, or custom)", bodyMode)
	}

	return nil
}

// ValidateHeadersJSON validates that headers is valid JSON
func ValidateHeadersJSON(headers string) error {
	if headers == "" {
		return nil
	}

	// Basic JSON object check
	trimmed := strings.TrimSpace(headers)
	if !strings.HasPrefix(trimmed, "{") || !strings.HasSuffix(trimmed, "}") {
		return fmt.Errorf("headers must be a valid JSON object")
	}

	return nil
}

// ValidateBodyJSON validates that body is valid JSON
func ValidateBodyJSON(body string) error {
	if body == "" {
		return nil
	}

	// Basic JSON object check
	trimmed := strings.TrimSpace(body)
	if !strings.HasPrefix(trimmed, "{") || !strings.HasSuffix(trimmed, "}") {
		return fmt.Errorf("body must be a valid JSON object")
	}

	return nil
}
