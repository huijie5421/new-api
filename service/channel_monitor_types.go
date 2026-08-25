package service

// CheckRequest represents a check task
type CheckRequest struct {
	MonitorID int
	Model     string
}

// CheckResult represents the result of a single check
type CheckResult struct {
	MonitorID  int
	Model      string
	Status     string
	LatencyMs  int
	ErrorMsg   string
	ResponseOK bool
	CheckedAt  int64
}

// ProviderAdapter defines the interface for provider-specific implementations
type ProviderAdapter interface {
	BuildRequest(endpoint string, apiKey string, model string, headers map[string]string, body map[string]interface{}, challenge *Challenge) (string, map[string]string, []byte, error)
	ValidateResponse(statusCode int, responseBody []byte, challenge *Challenge) (bool, string)
}

// Challenge represents an arithmetic challenge embedded in the request
type Challenge struct {
	Question string
	Answer   int
}

// MonitorRunResult represents the result of a manual run
type MonitorRunResult struct {
	MonitorID int                `json:"monitor_id"`
	Results   []ModelCheckResult `json:"results"`
}

// ModelCheckResult represents the check result for a single model
type ModelCheckResult struct {
	Model      string `json:"model"`
	Status     string `json:"status"`
	LatencyMs  int    `json:"latency_ms"`
	ErrorMsg   string `json:"error_msg"`
	ResponseOK bool   `json:"response_ok"`
}

// TemplateApplyRequest represents a request to apply a template to monitors
type TemplateApplyRequest struct {
	TemplateID int   `json:"template_id"`
	MonitorIDs []int `json:"monitor_ids"`
}

// AggregationStats represents aggregation statistics
type AggregationStats struct {
	StartDate        string `json:"start_date"`
	EndDate          string `json:"end_date"`
	ProcessedDays    int    `json:"processed_days"`
	RollupsCreated   int    `json:"rollups_created"`
	HistoriesScanned int    `json:"histories_scanned"`
}
