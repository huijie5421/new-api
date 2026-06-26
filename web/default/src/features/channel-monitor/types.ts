// TypeScript types for the channel-monitor (admin) feature.
//
// These interfaces mirror, field-for-field, the JSON contract emitted by the Go
// backend. Source of truth:
//   - model/channel_monitor.go (ChannelMonitor, ChannelMonitorHistory,
//     ChannelMonitorRequestTemplate)
//   - service/channel_monitor_types.go (MonitorRunResult, ModelCheckResult,
//     TemplateApplyRequest)
//   - controller/channel_monitor.go (handler response envelopes)
//
// Do not rename the exported types below — the api.ts files import them by name.

export type Provider = 'openai' | 'anthropic' | 'gemini';
export type APIMode = 'chat_completions' | 'responses';
export type BodyMode = 'auto' | 'minimal' | 'custom';
export type MonitorStatus = 'success' | 'failure' | 'unknown';

// model.ChannelMonitor — returned by:
//   GET    /api/channel_monitor            (data: ChannelMonitor[])
//   GET    /api/channel_monitor/:id        (data: ChannelMonitor)
//   POST   /api/channel_monitor            (data: ChannelMonitor)
//   PUT    /api/channel_monitor            (data: ChannelMonitor)
//   GET    /api/channel_monitor/status     (user; data: ChannelMonitor[])
//   GET    /api/channel_monitor/template/:id/monitors (data: ChannelMonitor[])
//
// Nullability mirrors Go pointer fields (*int64, *int, *float64 -> T | null).
export interface ChannelMonitor {
  id: number;
  name: string;
  provider: string;
  api_mode: string;
  endpoint: string;
  api_key: string;
  primary_model: string;
  extra_models: string; // JSON-encoded string[] (e.g. "[\"gpt-4\"]")
  group: string;
  interval_seconds: number;
  timeout_seconds: number;
  enabled: boolean;
  headers: string; // JSON object string
  body: string; // JSON object string (request body snapshot)
  body_mode: string; // "auto" | "minimal" | "custom"
  cc_spoof_enabled: boolean; // anthropic only: inject global Claude Code spoof
  template_id: number | null; // *int
  template_snapshot: string; // JSON string
  created_at: string; // RFC3339 timestamp
  updated_at: string; // RFC3339 timestamp
  last_check_at: number | null; // *int64 — Unix seconds
  last_status: string; // "success" | "failure" | "unknown"
  last_latency_ms: number | null; // *int
  availability_rate_7d: number | null; // *float64 — 0..1
  availability_rate_15d: number | null; // *float64 — 0..1
  availability_rate_30d: number | null; // *float64 — 0..1
}

// model.ChannelMonitorHistory — returned by:
//   GET /api/channel_monitor/:id/history (data: ChannelMonitorHistory[],
//                                         total: number, page: number)
export interface ChannelMonitorHistory {
  id: number; // int64
  monitor_id: number;
  model: string;
  status: string; // "success" | "failure"
  latency_ms: number;
  error_msg: string;
  checked_at: number; // Unix seconds
  response_ok: boolean;
  created_at: string; // RFC3339 timestamp
}

// model.ChannelMonitorRequestTemplate — returned by:
//   GET  /api/channel_monitor/template       (data: ChannelMonitorTemplate[])
//   GET  /api/channel_monitor/template/:id   (data: ChannelMonitorTemplate)
//   POST /api/channel_monitor/template       (data: ChannelMonitorTemplate)
//   PUT  /api/channel_monitor/template       (data: ChannelMonitorTemplate)
export interface ChannelMonitorTemplate {
  id: number;
  provider: string;
  name: string;
  api_mode: string;
  body_mode: string; // "auto" | "minimal" | "custom"
  headers: string; // JSON object string
  body: string; // JSON object string
  description: string;
  is_default: boolean;
  created_at: string; // RFC3339 timestamp
  updated_at: string; // RFC3339 timestamp
}

// service.ModelCheckResult — element of MonitorRunResult.results.
export interface ModelCheckResult {
  model: string;
  status: string; // "success" | "failure"
  latency_ms: number;
  error_msg: string;
  response_ok: boolean;
}

// service.MonitorRunResult — returned by:
//   POST /api/channel_monitor/:id/run (data: MonitorRunResult)
export interface MonitorRunResult {
  monitor_id: number;
  results: ModelCheckResult[];
}

// service.TemplateApplyRequest — request body for:
//   POST /api/channel_monitor/template/apply
export interface TemplateApplyRequest {
  template_id: number;
  monitor_ids: number[];
}
