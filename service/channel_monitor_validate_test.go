package service

import "testing"

func TestValidateMonitorConfigAcceptsGrokOpenAICompatibleProbe(t *testing.T) {
	err := ValidateMonitorConfig(
		ProviderGrok,
		APIModeChat,
		"https://api.x.ai",
		"test-key",
		"grok-4.5",
		60,
		10,
	)
	if err != nil {
		t.Fatalf("expected Grok monitor to be accepted: %v", err)
	}
}

func TestValidateMonitorConfigImageGeneration(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		apiMode  string
		timeout  int
		wantErr  bool
	}{
		{name: "openai 90 seconds", provider: ProviderOpenAI, apiMode: APIModeImageGeneration, timeout: 90},
		{name: "openai 180 seconds", provider: ProviderOpenAI, apiMode: APIModeImageGeneration, timeout: 180},
		{name: "openai 181 seconds", provider: ProviderOpenAI, apiMode: APIModeImageGeneration, timeout: 181, wantErr: true},
		{name: "grok 90 seconds", provider: ProviderGrok, apiMode: APIModeImageGeneration, timeout: 90},
		{name: "anthropic rejects image mode", provider: ProviderAnthropic, apiMode: APIModeImageGeneration, timeout: 90, wantErr: true},
		{name: "gemini rejects image mode", provider: ProviderGemini, apiMode: APIModeImageGeneration, timeout: 90, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateMonitorConfig(
				tt.provider,
				tt.apiMode,
				"https://api.x.ai",
				"test-key",
				"gpt-image-2",
				300,
				tt.timeout,
			)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateMonitorConfig() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateMonitorConfigKeepsTextTimeoutLimit(t *testing.T) {
	err := ValidateMonitorConfig(
		ProviderOpenAI,
		APIModeChat,
		"https://api.openai.com",
		"test-key",
		"gpt-4o",
		300,
		61,
	)
	if err == nil {
		t.Fatal("expected text monitor timeout above 60 seconds to be rejected")
	}
}

func TestValidateTemplateConfigRejectsImageModeForUnsupportedProvider(t *testing.T) {
	if err := ValidateTemplateConfig(ProviderAnthropic, APIModeImageGeneration, "image", BodyModeAuto); err == nil {
		t.Fatal("expected Anthropic image template to be rejected")
	}
	if err := ValidateTemplateConfig(ProviderOpenAI, APIModeImageGeneration, "image", BodyModeAuto); err != nil {
		t.Fatalf("expected OpenAI image template to be accepted: %v", err)
	}
}
