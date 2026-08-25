// TypeScript types for the channel-status (user, read-only) feature.
//
// Mirrors the JSON contract from controller/channel_monitor.go:
//   GetChannelMonitorStatus -> GET /api/channel_monitor/status/:id
//     data: { monitor: ChannelMonitor, models: ModelStatus[] }
//
// The ModelStatus shape is the inline struct declared inside
// GetChannelMonitorStatus. Its availability_* fields are float64 (0..1) and
// avg_latency_* fields are int — all non-nullable (zero values, never null).
//
// Do not rename MonitorStatusDetail / TimeWindow — api.ts imports them by name.

import type { ChannelMonitor } from '../channel-monitor/types'

// Inline `ModelStatus` struct from controller/channel_monitor.go.
export interface ModelStatus {
  model: string
  availability_7d: number // float64, 0..1
  availability_15d: number // float64, 0..1
  availability_30d: number // float64, 0..1
  avg_latency_7d: number // int (ms)
  avg_latency_15d: number // int (ms)
  avg_latency_30d: number // int (ms)
}

// `data` payload of GET /api/channel_monitor/status/:id.
export interface MonitorStatusDetail {
  monitor: ChannelMonitor
  models: ModelStatus[]
}

export type TimeWindow = '7d' | '15d' | '30d'

// One point of the primary-model check history surfaced on the user status
// list. error_msg is stripped server-side. status is binary in practice
// ('success' | 'failure'); 'unknown' is tolerated for forward-compat.
export interface MonitorTimelinePoint {
  status: string // 'success' | 'failure' | 'unknown'
  latency_ms: number
  checked_at: number // Unix seconds
}

// Sanitized user-facing monitor object returned by GET /api/channel-monitors/
// (channelStatusAPI.getAll). Secret/admin fields (api_key, endpoint, headers,
// body, template_snapshot, created_by, ...) are excluded server-side; only the
// read-only status surface is kept. Reuses the ChannelMonitor field shapes so
// existing card code keeps compiling.
export interface UserMonitorSummary {
  id: number
  name: string
  provider: string
  api_mode: string
  primary_model: string
  extra_models: string
  group: string
  enabled: boolean
  last_status: string
  last_latency_ms: number | null
  last_check_at: number | null
  availability_rate_7d: number | null
  availability_rate_15d: number | null
  availability_rate_30d: number | null
  timeline?: MonitorTimelinePoint[]
}
