package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// extractTextContent reduces a message content field that may be a plain
// string or an array of {type,text} parts (compatible gateways / reasoning
// models) into a single string. Other shapes (null, object, etc.) yield "".
func extractTextContent(raw json.RawMessage) string {
	switch common.GetJsonType(raw) {
	case "string":
		var s string
		if err := common.Unmarshal(raw, &s); err != nil {
			return ""
		}
		return s
	case "array":
		var parts []struct {
			Text string `json:"text"`
		}
		if err := common.Unmarshal(raw, &parts); err != nil {
			return ""
		}
		var b strings.Builder
		for _, p := range parts {
			b.WriteString(p.Text)
		}
		return b.String()
	default:
		return ""
	}
}

// isSSEStream reports whether the body is a Server-Sent-Events (streaming)
// response. A 200 SSE response with at least one real data chunk means the
// channel is serving requests and is therefore healthy — there is no single
// JSON object to validate.
func isSSEStream(body []byte) bool {
	s := bytes.TrimSpace(body)
	if len(s) == 0 {
		return false
	}
	if !bytes.HasPrefix(s, []byte("data:")) && !bytes.Contains(s, []byte("\ndata:")) {
		return false
	}
	for _, line := range bytes.Split(s, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		payload := bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
		if len(payload) > 0 && !bytes.Equal(payload, []byte("[DONE]")) {
			return true
		}
	}
	return false
}

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
		"stream":     false,
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
				Content json.RawMessage `json:"content"`
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

	content := extractTextContent(resp.Choices[0].Message.Content)
	if strings.TrimSpace(content) == "" {
		return false, "empty response content"
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
		"model":  model,
		"input":  challenge.Question,
		"stream": false,
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
		Output []struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		OutputText string `json:"output_text"`
		Error      *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := common.Unmarshal(responseBody, &resp); err != nil {
		return false, "invalid JSON response"
	}

	if resp.Error != nil {
		return false, resp.Error.Message
	}

	text := resp.OutputText
	if text == "" {
		var b strings.Builder
		for _, item := range resp.Output {
			for _, c := range item.Content {
				b.WriteString(c.Text)
			}
		}
		text = b.String()
	}

	if strings.TrimSpace(text) == "" {
		return false, "empty output"
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
		"stream":     false,
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
		Content json.RawMessage `json:"content"`
		Error   *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := common.Unmarshal(responseBody, &resp); err != nil {
		return false, "invalid JSON response"
	}

	if resp.Error != nil {
		return false, resp.Error.Message
	}

	text := extractTextContent(resp.Content)
	if strings.TrimSpace(text) == "" {
		return false, "no content in response"
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
	if strings.TrimSpace(text) == "" {
		return false, "empty response content"
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

	// Streaming (SSE) 200 responses: a channel returning a valid event stream is
	// serving requests — treat as healthy without JSON-validating each chunk.
	if resp.StatusCode == http.StatusOK && isSSEStream(responseBody) {
		result.ResponseOK = true
		result.Status = StatusSuccess
		result.ErrorMsg = ""
		return result
	}

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
