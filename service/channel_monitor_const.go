package service

const (
	// Provider types
	ProviderOpenAI    = "openai"
	ProviderAnthropic = "anthropic"
	ProviderGemini    = "gemini"

	// API modes (OpenAI-specific)
	APIModeChat      = "chat_completions"
	APIModeResponses = "responses"

	// Body modes
	BodyModeAuto    = "auto"
	BodyModeMinimal = "minimal"
	BodyModeCustom  = "custom"

	// Status
	StatusSuccess = "success"
	StatusFailure = "failure"
	StatusUnknown = "unknown"

	// Timeouts
	DefaultCheckTimeout = 10  // seconds
	MaxCheckTimeout     = 60  // seconds
	MinCheckInterval    = 60  // seconds
	MaxCheckInterval    = 3600 // 1 hour

	// Aggregation
	AggregationRetentionDays = 30
	HistoryRetentionDays     = 30
	MaxAggregationDaysPerRun = 35

	// Pool settings
	WorkerPoolSize = 5

	// SSRF protection
	SSRFBlockPrivateNetworks = true
)

// Provider-specific paths
var ProviderPaths = map[string]map[string]string{
	ProviderOpenAI: {
		APIModeChat:      "/v1/chat/completions",
		APIModeResponses: "/v1/responses",
	},
	ProviderAnthropic: {
		"default": "/v1/messages",
	},
	ProviderGemini: {
		"default": "/v1/models/%s:generateContent", // %s = model name
	},
}

// SSRF blocked CIDR ranges (RFC 1918 private networks, localhost, link-local)
var SSRFBlockedCIDRs = []string{
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"127.0.0.0/8",
	"169.254.0.0/16",
	"::1/128",
	"fe80::/10",
	"fc00::/7",
}
