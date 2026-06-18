export interface ChannelMonitor {
  id: number;
  name: string;
  provider: string;
  api_mode: string;
  endpoint: string;
  api_key: string;
  primary_model: string;
  extra_models: string;
  group: string;
  interval_seconds: number;
  timeout_seconds: number;
  enabled: boolean;
  headers: string;
  body: string;
  body_mode: string;
  template_id: number | null;
  template_snapshot: string;
  created_at: string;
  updated_at: string;
  last_check_at: number | null;
  last_status: string;
  last_latency_ms: number | null;
  availability_rate_7d: number | null;
  availability_rate_15d: number | null;
  availability_rate_30d: number | null;
}

export interface ChannelMonitorHistory {
  id: number;
  monitor_id: number;
  model: string;
  status: string;
  latency_ms: number;
  error_msg: string;
  checked_at: number;
  response_ok: boolean;
  created_at: string;
}

export interface ChannelMonitorTemplate {
  id: number;
  provider: string;
  name: string;
  api_mode: string;
  body_mode: string;
  headers: string;
  body: string;
  description: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelCheckResult {
  model: string;
  status: string;
  latency_ms: number;
  error_msg: string;
  response_ok: boolean;
}

export interface MonitorRunResult {
  monitor_id: number;
  results: ModelCheckResult[];
}

export interface TemplateApplyRequest {
  template_id: number;
  monitor_ids: number[];
}

export type Provider = 'openai' | 'anthropic' | 'gemini';
export type APIMode = 'chat_completions' | 'responses';
export type BodyMode = 'auto' | 'minimal' | 'custom';
export type MonitorStatus = 'success' | 'failure' | 'unknown';
