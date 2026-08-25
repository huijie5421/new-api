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
