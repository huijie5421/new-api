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

import type { ChannelMonitor } from '../channel-monitor/types';

// Inline `ModelStatus` struct from controller/channel_monitor.go.
export interface ModelStatus {
  model: string;
  availability_7d: number; // float64, 0..1
  availability_15d: number; // float64, 0..1
  availability_30d: number; // float64, 0..1
  avg_latency_7d: number; // int (ms)
  avg_latency_15d: number; // int (ms)
  avg_latency_30d: number; // int (ms)
}

// `data` payload of GET /api/channel_monitor/status/:id.
export interface MonitorStatusDetail {
  monitor: ChannelMonitor;
  models: ModelStatus[];
}

export type TimeWindow = '7d' | '15d' | '30d';
