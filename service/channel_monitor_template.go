package service

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// ApplyTemplateToMonitors applies a template to multiple monitors
func ApplyTemplateToMonitors(templateID int, monitorIDs []int) error {
	// Get template
	template, err := model.GetChannelMonitorTemplate(templateID)
	if err != nil {
		return fmt.Errorf("failed to get template: %w", err)
	}

	// Serialize template snapshot
	snapshotBytes, err := common.Marshal(template)
	if err != nil {
		return fmt.Errorf("failed to serialize template snapshot: %w", err)
	}
	snapshotStr := string(snapshotBytes)

	// Apply to each monitor
	for _, monitorID := range monitorIDs {
		monitor, err := model.GetChannelMonitor(monitorID)
		if err != nil {
			return fmt.Errorf("failed to get monitor %d: %w", monitorID, err)
		}

		// Validate provider match
		if monitor.Provider != template.Provider {
			return fmt.Errorf("monitor %d provider (%s) does not match template provider (%s)", monitorID, monitor.Provider, template.Provider)
		}

		// Update monitor with template values
		monitor.APIMode = template.APIMode
		monitor.BodyMode = template.BodyMode
		monitor.Headers = template.Headers
		monitor.Body = template.Body
		monitor.TemplateID = &templateID
		monitor.TemplateSnapshot = snapshotStr

		if err := model.UpdateChannelMonitor(monitor); err != nil {
			return fmt.Errorf("failed to update monitor %d: %w", monitorID, err)
		}
	}

	return nil
}

// BuildRequestBodyFromMode builds the request body based on body mode
func BuildRequestBodyFromMode(provider string, apiMode string, bodyMode string, customBody string) (string, error) {
	if bodyMode == BodyModeCustom {
		// Use custom body as-is
		return customBody, nil
	}

	// Build minimal or auto body
	var body map[string]interface{}
	if apiMode == APIModeImageGeneration {
		if provider != ProviderOpenAI && provider != ProviderGrok {
			return "", fmt.Errorf("image_generation is unsupported for provider: %s", provider)
		}
		body = map[string]interface{}{
			"n":    1,
			"size": "1024x1024",
		}
		bodyBytes, err := common.Marshal(body)
		if err != nil {
			return "", err
		}
		return string(bodyBytes), nil
	}

	switch provider {
	case ProviderOpenAI, ProviderGrok:
		if bodyMode == BodyModeMinimal {
			body = map[string]interface{}{
				"max_tokens": 100,
			}
		} else {
			// Auto mode with common parameters
			body = map[string]interface{}{
				"max_tokens":  100,
				"temperature": 0.7,
			}
		}
	case ProviderAnthropic:
		if bodyMode == BodyModeMinimal {
			body = map[string]interface{}{
				"max_tokens": 100,
			}
		} else {
			body = map[string]interface{}{
				"max_tokens":  100,
				"temperature": 0.7,
			}
		}
	case ProviderGemini:
		if bodyMode == BodyModeMinimal {
			body = map[string]interface{}{}
		} else {
			body = map[string]interface{}{
				"generationConfig": map[string]interface{}{
					"maxOutputTokens": 100,
					"temperature":     0.7,
				},
			}
		}
	default:
		return "", fmt.Errorf("unsupported provider: %s", provider)
	}

	bodyBytes, err := common.Marshal(body)
	if err != nil {
		return "", err
	}

	return string(bodyBytes), nil
}

// NormalizeMonitorRequestBody preserves explicitly custom JSON and rebuilds
// system-managed bodies from the current provider/API mode. Rebuilding avoids
// retaining chat-only fields when an existing monitor switches to image mode.
func NormalizeMonitorRequestBody(provider string, apiMode string, bodyMode string, currentBody string) (string, error) {
	if bodyMode == BodyModeCustom {
		return currentBody, nil
	}
	return BuildRequestBodyFromMode(provider, apiMode, bodyMode, "")
}
