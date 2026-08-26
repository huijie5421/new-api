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
	"github.com/QuantumNous/new-api/setting/operation_setting"
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

// OpenAIImageAdapter implements the OpenAI-compatible image generations API.
// Image probes deliberately validate the response contract without downloading
// the generated asset.
type OpenAIImageAdapter struct{}

func buildOpenAIImageURL(endpoint string) string {
	base := strings.TrimRight(endpoint, "/")
	const imagePath = "/v1/images/generations"
	if strings.HasSuffix(base, imagePath) {
		return base
	}
	if strings.HasSuffix(base, "/v1") {
		return base + "/images/generations"
	}
	return base + imagePath
}

func (a *OpenAIImageAdapter) BuildRequest(endpoint string, apiKey string, model string, headers map[string]string, body map[string]interface{}, challenge *Challenge) (string, map[string]string, []byte, error) {
	reqHeaders := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer " + apiKey,
	}
	for k, v := range headers {
		reqHeaders[k] = v
	}

	reqBody := map[string]interface{}{
		"model":  model,
		"prompt": "a cute cat",
		"n":      1,
		"size":   "1024x1024",
	}
	for k, v := range body {
		if k == "model" {
			continue
		}
		reqBody[k] = v
	}

	bodyBytes, err := common.Marshal(reqBody)
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to marshal request body: %w", err)
	}
	return buildOpenAIImageURL(endpoint), reqHeaders, bodyBytes, nil
}

func (a *OpenAIImageAdapter) ValidateResponse(statusCode int, responseBody []byte, challenge *Challenge) (bool, string) {
	if statusCode < http.StatusOK || statusCode >= http.StatusMultipleChoices {
		return false, fmt.Sprintf("HTTP %d", statusCode)
	}

	var resp struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := common.Unmarshal(responseBody, &resp); err != nil {
		return false, "invalid JSON response"
	}
	if resp.Error != nil && strings.TrimSpace(resp.Error.Message) != "" {
		return false, resp.Error.Message
	}
	if len(resp.Data) == 0 {
		return false, "no image data in response"
	}
	first := resp.Data[0]
	if strings.TrimSpace(first.URL) == "" && strings.TrimSpace(first.B64JSON) == "" {
		return false, "image data has neither url nor b64_json"
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
	case ProviderOpenAI, ProviderGrok:
		switch apiMode {
		case APIModeResponses:
			return &OpenAIResponsesAdapter{}, nil
		case APIModeImageGeneration:
			return &OpenAIImageAdapter{}, nil
		case APIModeChat:
			return &OpenAIChatAdapter{}, nil
		default:
			return nil, fmt.Errorf("unsupported api_mode for %s: %s", provider, apiMode)
		}
	case ProviderAnthropic:
		return &AnthropicAdapter{}, nil
	case ProviderGemini:
		return &GeminiAdapter{}, nil
	default:
		return nil, fmt.Errorf("unsupported provider: %s", provider)
	}
}

// monitorRetryDelay 瞬时(请求层)失败后的重试等待时间。
const monitorRetryDelay = 10 * time.Second

// PerformCheck executes a health check for a model. If the first attempt fails
// at the REQUEST layer (could not send / connect / read — i.e. a transient
// network problem rather than the channel returning a bad response), it waits
// 10s and retries once; a successful retry is recorded as success. Failures
// that come from the upstream itself (non-2xx, error body, empty completion)
// are NOT retried — those reflect a genuine channel problem.
func PerformCheck(ctx context.Context, monitor *model.ChannelMonitor, modelName string) *CheckResult {
	result, transient := performCheckOnce(ctx, monitor, modelName)
	if result.Status == StatusSuccess || !transient {
		return result
	}

	// Transient request-layer failure: wait and retry once.
	select {
	case <-ctx.Done():
		return result
	case <-time.After(monitorRetryDelay):
	}

	retry, _ := performCheckOnce(ctx, monitor, modelName)
	if retry.Status == StatusSuccess {
		return retry
	}
	// Retry also failed — keep the original result.
	return result
}

// performCheckOnce executes a single health-check attempt. The second return
// value is true when the failure occurred at the request layer (transient,
// worth retrying) rather than from the upstream response.
func performCheckOnce(ctx context.Context, monitor *model.ChannelMonitor, modelName string) (*CheckResult, bool) {
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
		return result, false
	}

	// Generate challenge
	challenge := GenerateChallenge()

	// Parse headers and body
	var headers map[string]string
	var body map[string]interface{}

	if monitor.Headers != "" {
		if err := common.Unmarshal([]byte(monitor.Headers), &headers); err != nil {
			result.ErrorMsg = fmt.Sprintf("invalid headers JSON: %v", err)
			return result, false
		}
	}

	if monitor.Body != "" {
		if err := common.Unmarshal([]byte(monitor.Body), &body); err != nil {
			result.ErrorMsg = fmt.Sprintf("invalid body JSON: %v", err)
			return result, false
		}
	}

	// Claude Code 伪装：仅 anthropic 监控且开启 cc_spoof_enabled 时，注入全局伪装配置
	// 的请求头与 system / metadata.user_id，使探测请求被上游识别为官方 CLI。
	if monitor.CCSpoofEnabled && monitor.Provider == ProviderAnthropic {
		headers, body = applyClaudeCodeSpoof(headers, body)
	}

	// Build request
	reqURL, reqHeaders, reqBody, err := adapter.BuildRequest(monitor.Endpoint, monitor.APIKey, modelName, headers, body, challenge)
	if err != nil {
		result.ErrorMsg = err.Error()
		return result, false
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
		return result, false
	}

	for k, v := range reqHeaders {
		req.Header.Set(k, v)
	}

	// Execute request — a failure here is a transient request-layer problem.
	resp, err := client.Do(req)
	if err != nil {
		result.ErrorMsg = fmt.Sprintf("request failed: %v", err)
		result.LatencyMs = int(time.Since(startTime).Milliseconds())
		return result, true
	}
	defer resp.Body.Close()

	// Read response — a read failure is also transient.
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		result.ErrorMsg = fmt.Sprintf("failed to read response: %v", err)
		result.LatencyMs = int(time.Since(startTime).Milliseconds())
		return result, true
	}

	result.LatencyMs = int(time.Since(startTime).Milliseconds())

	// Streaming (SSE) 200 responses: a channel returning a valid event stream is
	// serving requests — treat as healthy without JSON-validating each chunk.
	if monitor.APIMode != APIModeImageGeneration && resp.StatusCode == http.StatusOK && isSSEStream(responseBody) {
		result.ResponseOK = true
		result.Status = StatusSuccess
		result.ErrorMsg = ""
		return result, false
	}

	// Validate response — failures here come from the upstream, not transient.
	responseOK, errMsg := adapter.ValidateResponse(resp.StatusCode, responseBody, challenge)
	result.ResponseOK = responseOK

	if responseOK {
		result.Status = StatusSuccess
		result.ErrorMsg = ""
	} else {
		result.Status = StatusFailure
		result.ErrorMsg = errMsg
	}

	return result, false
}

// applyClaudeCodeSpoof 把全局 Claude Code 伪装配置注入到 anthropic 探测请求的
// headers 与 body 中：
//   - headers：合并伪装头（UA / X-App / anthropic-beta / anthropic-version 等），覆盖同名项
//   - body.system：伪装 system 块插到数组首位（上游按首项判定）；OverrideUserSystem
//     为 true 时仅保留伪装块，否则把用户原有 system 接其后
//   - body.metadata.user_id：注入官方格式 user_id（保留用户已设的其他 metadata 字段，
//     不覆盖用户显式设置的 user_id）
//
// 返回新的 headers / body，原 map 不被破坏性修改之外的副作用影响。
func applyClaudeCodeSpoof(headers map[string]string, body map[string]interface{}) (map[string]string, map[string]interface{}) {
	cfg := operation_setting.GetClaudeCodeSpoofSetting()

	// --- headers ---
	if headers == nil {
		headers = make(map[string]string)
	}
	for k, v := range cfg.SpoofHeaders() {
		headers[k] = v
	}

	// --- body ---
	if body == nil {
		body = make(map[string]interface{})
	}

	// system: 伪装块插到首位
	if cfg.SystemPrompt != "" {
		spoofBlock := map[string]interface{}{
			"type": "text",
			"text": cfg.SystemPrompt,
		}
		system := []interface{}{spoofBlock}
		if !cfg.OverrideUserSystem {
			system = append(system, normalizeSystemEntries(body["system"])...)
		}
		body["system"] = system
	}

	// metadata.user_id: 注入官方格式（不覆盖用户已显式设置的 user_id）
	if cfg.MetadataUserID != "" {
		metadata, _ := body["metadata"].(map[string]interface{})
		if metadata == nil {
			metadata = make(map[string]interface{})
		}
		if existing, ok := metadata["user_id"].(string); !ok || strings.TrimSpace(existing) == "" {
			metadata["user_id"] = cfg.MetadataUserID
		}
		body["metadata"] = metadata
	}

	return headers, body
}

// normalizeSystemEntries 把 body 中已有的 system 字段统一转换为 anthropic system
// 数组元素切片。支持三种来源：字符串（包成 text 块）、对象数组（原样保留）、其它（忽略）。
func normalizeSystemEntries(raw interface{}) []interface{} {
	switch v := raw.(type) {
	case string:
		if strings.TrimSpace(v) == "" {
			return nil
		}
		return []interface{}{map[string]interface{}{"type": "text", "text": v}}
	case []interface{}:
		return v
	default:
		return nil
	}
}
