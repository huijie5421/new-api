import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { channelStatusAPI } from '../api';
import type { ChannelMonitor } from '../../channel-monitor/types';
import type { TimeWindow } from '../types';

export default function ChannelStatusView() {
  const { t } = useTranslation();
  const [monitors, setMonitors] = useState<ChannelMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('7d');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const loadMonitors = async () => {
    try {
      const data = await channelStatusAPI.getAll();
      setMonitors(data);
    } catch (error) {
      console.error('Failed to load channel status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonitors();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadMonitors();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getAvailabilityRate = (monitor: ChannelMonitor) => {
    switch (timeWindow) {
      case '7d':
        return monitor.availability_rate_7d;
      case '15d':
        return monitor.availability_rate_15d;
      case '30d':
        return monitor.availability_rate_30d;
    }
  };

  const formatAvailability = (rate: number | null) => {
    if (rate === null) return 'N/A';
    return `${(rate * 100).toFixed(1)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-500';
      case 'failure':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getAvailabilityColor = (rate: number | null) => {
    if (rate === null) return 'text-gray-500';
    if (rate >= 0.99) return 'text-green-600';
    if (rate >= 0.95) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Channel Status</h1>
          <p className="text-gray-600">Real-time monitoring of API endpoints</p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setTimeWindow('7d')}
                className={`px-4 py-2 rounded ${
                  timeWindow === '7d'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setTimeWindow('15d')}
                className={`px-4 py-2 rounded ${
                  timeWindow === '15d'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                15 Days
              </button>
              <button
                onClick={() => setTimeWindow('30d')}
                className={`px-4 py-2 rounded ${
                  timeWindow === '30d'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                30 Days
              </button>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Auto-refresh</span>
                {autoRefresh && (
                  <span className="text-xs text-gray-500">({countdown}s)</span>
                )}
              </label>
              <button
                onClick={loadMonitors}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Monitor Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {monitors.map((monitor) => {
            const availability = getAvailabilityRate(monitor);
            return (
              <div
                key={monitor.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {monitor.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {monitor.provider} • {monitor.primary_model}
                      </p>
                    </div>
                    <div
                      className={`w-3 h-3 rounded-full ${getStatusColor(
                        monitor.last_status
                      )}`}
                      title={monitor.last_status}
                    />
                  </div>

                  {/* Metrics */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600">Availability</span>
                        <span
                          className={`text-lg font-bold ${getAvailabilityColor(
                            availability
                          )}`}
                        >
                          {formatAvailability(availability)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            availability && availability >= 0.95
                              ? 'bg-green-500'
                              : 'bg-red-500'
                          }`}
                          style={{
                            width: availability
                              ? `${availability * 100}%`
                              : '0%',
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Latency</span>
                      <span className="text-sm font-medium">
                        {monitor.last_latency_ms
                          ? `${monitor.last_latency_ms}ms`
                          : 'N/A'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Last Check</span>
                      <span className="text-sm font-medium">
                        {monitor.last_check_at
                          ? new Date(
                              monitor.last_check_at * 1000
                            ).toLocaleString()
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {monitors.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No monitors available
          </div>
        )}
      </div>
    </div>
  );
}
