package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestBuildRequestBodyFromModeImage(t *testing.T) {
	for _, mode := range []string{BodyModeAuto, BodyModeMinimal} {
		t.Run(mode, func(t *testing.T) {
			body, err := BuildRequestBodyFromMode(ProviderOpenAI, APIModeImageGeneration, mode, "")
			if err != nil {
				t.Fatalf("BuildRequestBodyFromMode() error = %v", err)
			}
			var decoded map[string]interface{}
			if err := common.Unmarshal([]byte(body), &decoded); err != nil {
				t.Fatalf("invalid JSON body: %v", err)
			}
			if decoded["n"] != float64(1) {
				t.Fatalf("n = %#v, want 1", decoded["n"])
			}
			if decoded["size"] != "1024x1024" {
				t.Fatalf("size = %#v, want 1024x1024", decoded["size"])
			}
		})
	}
}

func TestBuildRequestBodyFromModeKeepsTextBody(t *testing.T) {
	body, err := BuildRequestBodyFromMode(ProviderOpenAI, APIModeChat, BodyModeMinimal, "")
	if err != nil {
		t.Fatalf("BuildRequestBodyFromMode() error = %v", err)
	}
	var decoded map[string]interface{}
	if err := common.Unmarshal([]byte(body), &decoded); err != nil {
		t.Fatalf("invalid JSON body: %v", err)
	}
	if decoded["max_tokens"] != float64(100) {
		t.Fatalf("max_tokens = %#v, want 100", decoded["max_tokens"])
	}
}

func TestBuildRequestBodyFromModeKeepsCustomImageBody(t *testing.T) {
	const custom = `{"quality":"high","n":4}`
	body, err := BuildRequestBodyFromMode(ProviderOpenAI, APIModeImageGeneration, BodyModeCustom, custom)
	if err != nil {
		t.Fatalf("BuildRequestBodyFromMode() error = %v", err)
	}
	if body != custom {
		t.Fatalf("body = %q, want custom body unchanged", body)
	}
}

func TestNormalizeMonitorRequestBodyRebuildsNonCustomBodyAfterModeChange(t *testing.T) {
	body, err := NormalizeMonitorRequestBody(
		ProviderOpenAI,
		APIModeImageGeneration,
		BodyModeAuto,
		`{"max_tokens":100}`,
	)
	if err != nil {
		t.Fatalf("NormalizeMonitorRequestBody() error = %v", err)
	}
	var decoded map[string]interface{}
	if err := common.Unmarshal([]byte(body), &decoded); err != nil {
		t.Fatalf("invalid JSON body: %v", err)
	}
	if _, exists := decoded["max_tokens"]; exists {
		t.Fatalf("stale text field remains in image body: %#v", decoded)
	}
	if decoded["n"] != float64(1) || decoded["size"] != "1024x1024" {
		t.Fatalf("image defaults missing: %#v", decoded)
	}
}

func TestNormalizeMonitorRequestBodyPreservesCustomBody(t *testing.T) {
	const custom = `{"prompt":"custom","n":2}`
	body, err := NormalizeMonitorRequestBody(
		ProviderOpenAI,
		APIModeImageGeneration,
		BodyModeCustom,
		custom,
	)
	if err != nil {
		t.Fatalf("NormalizeMonitorRequestBody() error = %v", err)
	}
	if body != custom {
		t.Fatalf("body = %q, want %q", body, custom)
	}
}
