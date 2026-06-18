package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// OpenAIChatAdapter implements ProviderAdapter for OpenAI chat completions
type OpenAIChatAdapter struct{}

func (a *OpenAIChatAdapter) BuildRequest(endpoint string, apiKey string, model string, headers map[string]string, body map[string]interface{}, challenge *Challenge) (string, map[string]string, []byte, error) {
	// Build URL
	reqURL := strings.TrimSuffix(endpoint, "/") + "/v1/chat/completions"

	// Build headers
	reqHeaders := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer " + apiKey,
	}
	for k, v := range headers {
		reqHeaders[k] = v
	}

	// Build body
	reqBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{
				"role":    "user",
				"content": challenge.Question,
			},
		},
		"max_tokens": 100,
	}

	// Merge custom body fields
	for k, v := range body {
		if k != "model" && k != "messages" {
			reqBody[k] = v
		}
	}

	bodyBytes, err := common.Marshal(reqBody)
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	return reqURL, reqHeaders, bodyBytes, nil
}

func (a *OpenAIChatAdapter) ValidateResponse(statusCode int, responseBody []byte, challenge *Challenge) (bool, string) {
	if statusCode != http.StatusOK {
		return false, fmt.Sprintf("HTTP %d", statusCode)
	}

	var resp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := common.Unmarshal(responseBody, &resp); err != nil {
		return false, "invalid JSON response"
	}

	if resp.Error != nil {
		return false, resp.Error.Message
	}

	if len(resp.Choices) == 0 {
		return false, "no choices in response"
	}

	content := resp.Choices[0].Message.Content
	if !ValidateChallengeResponse(content, challenge) {
		return false, "challenge validation failed"
	}

	return true, ""
}

// OpenAIResponsesAdapter implements ProviderAdapter for OpenAI responses API
type OpenAIResponsesAdapter struct{}

func (a *OpenAIResponsesAdapter) BuildRequest(endpoint string, apiKey string, model string, headers map[string]string, body map[string]interface{}, challenge *Challenge) (string, map[string]string, []byte, error) {
	reqURL := strings.TrimSuffix(endpoint, "/") + "/v1/responses"

	reqHeaders := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer " + apiKey,
	}
	for k, v := range headers {
		reqHeaders[k] = v
	}

	reqBody := map[string]interface{}{
		"model": model,
		"input": challenge.Question,
	}

	for k, v := range body {
		if k != "model" && k != "input" {
			reqBody[k] = v
		}
	}

	bodyBytes, err := common.Marshal(reqBody)
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	return reqURL, reqHeaders, bodyBytes, nil
}

func (a *OpenAIResponsesAdapter) ValidateResponse(statusCode int, responseBody []byte, challenge *Challenge) (bool, string) {
	if statusCode != http.StatusOK {
		return false, fmt.Sprintf("HTTP %d", statusCode)
	}

	var resp struct {
		Output string `json:"output"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := common.Unmarshal(responseBody, &resp); err != nil {
		return false, "invalid JSON response"
	}

	if resp.Error != nil {
		return false, resp.Error.Message
	}

	if resp.Output == "" {
		return false, "empty output"
	}

	if !ValidateChallengeResponse(resp.Output, challenge) {
		return false, "challenge validation failed"
	}

	return true, ""
}

// AnthropicAdapter implements ProviderAdapter for Anthropic
type AnthropicAdapter struct{}

func (a *AnthropicAdapter) BuildRequest(endpoint string, apiKey string, model string, headers map[string]string, body map[string]interface{}, challenge *Challenge) (string, map[string]string, []byte, error) {
	reqURL := strings.TrimSuffix(endpoint, "/") + "/v1/messages"

	reqHeaders := map[string]string{
		"Content-Type":      "application/json",
		"x-api-key":         apiKey,
		"anthropic-version": "2023-06-01",
	}
	for k, v := range headers {
		reqHeaders[k] = v
	}

	reqBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{
				"role":    "user",
				"content": challenge.Question,
			},
		},
		"max_tokens": 100,
	}

	for k, v := range body {
		if k != "model" && k != "messages" {
			reqBody[k] = v
		}
	}

	bodyBytes, err := common.Marshal(reqBody)
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	return reqURL, reqHeaders, bodyBytes, nil
}

func (a *AnthropicAdapter) ValidateResponse(statusCode int, responseBody []byte, challenge *Challenge) (bool, string) {
	if statusCode != http.StatusOK {
		return false, fmt.Sprintf("HTTP %d", statusCode)
	}

	var resp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := common.Unmarshal(responseBody, &resp); err != nil {
		return false, "invalid JSON response"
	}

	if resp.Error != nil {
		return false, resp.Error.Message
	}

	if len(resp.Content) == 0 {
		return false, "no content in response"
	}

	text := resp.Content[0].Text
	if !ValidateChallengeResponse(text, challenge) {
		return false, "challenge validation failed"
	}

	return true, ""
}

// GeminiAdapter implements ProviderAdapter for Google Gemini
type GeminiAdapter struct{}

func (a *GeminiAdapter) BuildRequest(endpoint string, apiKey string, model string, headers map[string]string, body map[string]interface{}, challenge *Challenge) (string, map[string]string, []byte, error) {
	// Gemini uses API key as query parameter
	baseURL := strings.TrimSuffix(endpoint, "/")
	reqURL := fmt.Sprintf("%s/v1/models/%s:generateContent?key=%s", baseURL, url.PathEscape(model), url.QueryEscape(apiKey))

	reqHeaders := map[string]string{
		"Content-Type": "application/json",
	}
	for k, v := range headers {
		reqHeaders[k] = v
	}

	reqBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]string{
					{
						"text": challenge.Question,
					},
				},
			},
		},
	}

	for k, v := range body {
		if k != "contents" {
			reqBody[k] = v
		}
	}

	bodyBytes, err := common.Marshal(reqBody)
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	return reqURL, reqHeaders, bodyBytes, nil
}

func (a *GeminiAdapter) ValidateResponse(statusCode int, responseBody []byte, challenge *Challenge) (bool, string) {
	if statusCode != http.StatusOK {
		return false, fmt.Sprintf("HTTP %d", statusCode)
	}

	var resp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := common.Unmarshal(responseBody, &resp); err != nil {
		return false, "invalid JSON response"
	}

	if resp.Error != nil {
		return false, resp.Error.Message
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return false, "no content in response"
	}

	text := resp.Candidates[0].Content.Parts[0].Text
	if !ValidateChallengeResponse(text, challenge) {
		return false, "challenge validation failed"
	}

	return true, ""
}

// GetProviderAdapter returns the appropriate adapter for a provider/api_mode
func GetProviderAdapter(provider string, apiMode string) (ProviderAdapter, error) {
	switch provider {
	case ProviderOpenAI:
		if apiMode == APIModeResponses {
			return &OpenAIResponsesAdapter{}, nil
		}
		return &OpenAIChatAdapter{}, nil
	case ProviderAnthropic:
		return &AnthropicAdapter{}, nil
	case ProviderGemini:
		return &GeminiAdapter{}, nil
	default:
		return nil, fmt.Errorf("unsupported provider: %s", provider)
	}
}

// PerformCheck executes a single health check for a model
func PerformCheck(ctx context.Context, monitor *model.ChannelMonitor, modelName string) *CheckResult {
	startTime := time.Now()
	result := &CheckResult{
		MonitorID: monitor.ID,
		Model:     modelName,
		Status:    StatusFailure,
		CheckedAt: startTime.Unix(),
	}

	// Get adapter
	adapter, err := GetProviderAdapter(monitor.Provider, monitor.APIMode)
	if err != nil {
		result.ErrorMsg = err.Error()
		return result
	}

	// Generate challenge
	challenge := GenerateChallenge()

	// Parse headers and body
	var headers map[string]string
	var body map[string]interface{}

	if monitor.Headers != "" {
		if err := common.Unmarshal([]byte(monitor.Headers), &headers); err != nil {
			result.ErrorMsg = fmt.Sprintf("invalid headers JSON: %v", err)
			return result
		}
	}

	if monitor.Body != "" {
		if err := common.Unmarshal([]byte(monitor.Body), &body); err != nil {
			result.ErrorMsg = fmt.Sprintf("invalid body JSON: %v", err)
			return result
		}
	}

	// Build request
	reqURL, reqHeaders, reqBody, err := adapter.BuildRequest(monitor.Endpoint, monitor.APIKey, modelName, headers, body, challenge)
	if err != nil {
		result.ErrorMsg = err.Error()
		return result
	}

	// Create HTTP client with timeout and SSRF protection
	timeout := time.Duration(monitor.TimeoutSeconds) * time.Second
	client := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext:           SSRFProtectedDialer(timeout).DialContext,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: timeout,
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: false,
			},
		},
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewReader(reqBody))
	if err != nil {
		result.ErrorMsg = fmt.Sprintf("failed to create request: %v", err)
		return result
	}

	for k, v := range reqHeaders {
		req.Header.Set(k, v)
	}

	// Execute request
	resp, err := client.Do(req)
	if err != nil {
		result.ErrorMsg = fmt.Sprintf("request failed: %v", err)
		result.LatencyMs = int(time.Since(startTime).Milliseconds())
		return result
	}
	defer resp.Body.Close()

	// Read response
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		result.ErrorMsg = fmt.Sprintf("failed to read response: %v", err)
		result.LatencyMs = int(time.Since(startTime).Milliseconds())
		return result
	}

	result.LatencyMs = int(time.Since(startTime).Milliseconds())

	// Validate response
	responseOK, errMsg := adapter.ValidateResponse(resp.StatusCode, responseBody, challenge)
	result.ResponseOK = responseOK

	if responseOK {
		result.Status = StatusSuccess
		result.ErrorMsg = ""
	} else {
		result.Status = StatusFailure
		result.ErrorMsg = errMsg
	}

	return result
}
