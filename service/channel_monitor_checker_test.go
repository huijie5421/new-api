package service

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestOpenAIImageAdapterBuildRequest(t *testing.T) {
	adapter := &OpenAIImageAdapter{}
	for _, tt := range []struct {
		name     string
		endpoint string
		wantURL  string
	}{
		{name: "root endpoint", endpoint: "https://api.example.com", wantURL: "https://api.example.com/v1/images/generations"},
		{name: "v1 endpoint", endpoint: "https://api.example.com/v1", wantURL: "https://api.example.com/v1/images/generations"},
		{name: "full image endpoint", endpoint: "https://api.example.com/v1/images/generations", wantURL: "https://api.example.com/v1/images/generations"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			url, headers, rawBody, err := adapter.BuildRequest(
				tt.endpoint,
				"sk-test",
				"gpt-image-2",
				map[string]string{"X-Test": "1"},
				map[string]interface{}{},
				nil,
			)
			if err != nil {
				t.Fatalf("BuildRequest() error = %v", err)
			}
			if url != tt.wantURL {
				t.Fatalf("url = %q, want %q", url, tt.wantURL)
			}
			if headers["Authorization"] != "Bearer sk-test" {
				t.Fatalf("Authorization = %q", headers["Authorization"])
			}
			if headers["Content-Type"] != "application/json" || headers["X-Test"] != "1" {
				t.Fatalf("headers = %#v", headers)
			}
			var body map[string]interface{}
			if err := json.Unmarshal(rawBody, &body); err != nil {
				t.Fatalf("body is not JSON: %v", err)
			}
			if body["model"] != "gpt-image-2" || body["prompt"] != "a cute cat" || body["n"] != float64(1) || body["size"] != "1024x1024" {
				t.Fatalf("body = %#v", body)
			}
		})
	}
}

func TestOpenAIImageAdapterKeepsConfigurableImageFields(t *testing.T) {
	adapter := &OpenAIImageAdapter{}
	_, _, rawBody, err := adapter.BuildRequest(
		"https://api.example.com",
		"sk-test",
		"gpt-image-2",
		nil,
		map[string]interface{}{
			"model":           "other-model",
			"prompt":          "custom health-check prompt",
			"n":               4,
			"size":            "512x512",
			"quality":         "high",
			"response_format": "b64_json",
		},
		nil,
	)
	if err != nil {
		t.Fatalf("BuildRequest() error = %v", err)
	}
	var body map[string]interface{}
	if err := json.Unmarshal(rawBody, &body); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}
	if body["model"] != "gpt-image-2" {
		t.Fatalf("task model was overwritten: %#v", body)
	}
	if body["prompt"] != "custom health-check prompt" || body["n"] != float64(4) || body["size"] != "512x512" {
		t.Fatalf("configurable image fields were not preserved: %#v", body)
	}
	if body["quality"] != "high" || body["response_format"] != "b64_json" {
		t.Fatalf("custom fields were not preserved: %#v", body)
	}
}

func TestOpenAIImageAdapterValidateResponse(t *testing.T) {
	adapter := &OpenAIImageAdapter{}
	cases := []struct {
		name       string
		statusCode int
		body       string
		wantOK     bool
	}{
		{name: "url response", statusCode: http.StatusOK, body: `{"data":[{"url":"https://images.example.com/result.png"}]}`, wantOK: true},
		{name: "base64 response", statusCode: http.StatusOK, body: `{"data":[{"b64_json":"aGVsbG8="}]}`, wantOK: true},
		{name: "accepted 201 response", statusCode: http.StatusCreated, body: `{"data":[{"url":"https://images.example.com/result.png"}]}`, wantOK: true},
		{name: "empty data", statusCode: http.StatusOK, body: `{"data":[]}`, wantOK: false},
		{name: "missing image fields", statusCode: http.StatusOK, body: `{"data":[{}]}`, wantOK: false},
		{name: "invalid JSON", statusCode: http.StatusOK, body: `not-json`, wantOK: false},
		{name: "upstream error", statusCode: http.StatusUnauthorized, body: `{"error":{"message":"invalid api key"}}`, wantOK: false},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			ok, _ := adapter.ValidateResponse(tt.statusCode, []byte(tt.body), nil)
			if ok != tt.wantOK {
				t.Fatalf("ValidateResponse() ok = %v, want %v", ok, tt.wantOK)
			}
		})
	}
}

func TestGetProviderAdapterImageGeneration(t *testing.T) {
	for _, provider := range []string{ProviderOpenAI, ProviderGrok} {
		adapter, err := GetProviderAdapter(provider, APIModeImageGeneration)
		if err != nil {
			t.Fatalf("GetProviderAdapter(%q) error = %v", provider, err)
		}
		if _, ok := adapter.(*OpenAIImageAdapter); !ok {
			t.Fatalf("GetProviderAdapter(%q) type = %T, want *OpenAIImageAdapter", provider, adapter)
		}
	}
	if _, err := GetProviderAdapter(ProviderOpenAI, "unknown"); err == nil {
		t.Fatal("expected unknown API mode to return an error")
	}
}
