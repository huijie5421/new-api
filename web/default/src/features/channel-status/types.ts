import type { ChannelMonitor } from '../channel-monitor/types';

export interface ModelStatus {
  model: string;
  availability_7d: number;
  availability_15d: number;
  availability_30d: number;
  avg_latency_7d: number;
  avg_latency_15d: number;
  avg_latency_30d: number;
}

export interface MonitorStatusDetail {
  monitor: ChannelMonitor;
  models: ModelStatus[];
}

export type TimeWindow = '7d' | '15d' | '30d';
