import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { channelMonitorAPI } from '../api';
import type { ChannelMonitor } from '../types';

export default function ChannelMonitorView() {
  const { t } = useTranslation();
  const [monitors, setMonitors] = useState<ChannelMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const loadMonitors = async () => {
    setLoading(true);
    try {
      const enabledFilter =
        filter === 'all' ? undefined : filter === 'enabled';
      const data = await channelMonitorAPI.getAll(enabledFilter);
      setMonitors(data);
    } catch (error) {
      console.error('Failed to load monitors:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonitors();
  }, [filter]);

  const handleToggleEnabled = async (monitor: ChannelMonitor) => {
    try {
      await channelMonitorAPI.update(monitor.id, {
        ...monitor,
        enabled: !monitor.enabled,
      });
      loadMonitors();
    } catch (error) {
      console.error('Failed to toggle monitor:', error);
    }
  };

  const handleRunNow = async (id: number) => {
    try {
      const result = await channelMonitorAPI.runNow(id);
      alert(`Check completed:\n${result.results.map(r => `${r.model}: ${r.status} (${r.latency_ms}ms)`).join('\n')}`);
      loadMonitors();
    } catch (error) {
      console.error('Failed to run monitor:', error);
      alert('Failed to run monitor');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete monitor "${name}"?`)) return;
    try {
      await channelMonitorAPI.delete(id);
      loadMonitors();
    } catch (error) {
      console.error('Failed to delete monitor:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'failure':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  const formatAvailability = (rate: number | null) => {
    if (rate === null) return 'N/A';
    return `${(rate * 100).toFixed(1)}%`;
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Channel Monitors</h1>
        <button
          onClick={() => {/* TODO: Open create dialog */}}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Monitor
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('enabled')}
          className={`px-3 py-1 rounded ${filter === 'enabled' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Enabled
        </button>
        <button
          onClick={() => setFilter('disabled')}
          className={`px-3 py-1 rounded ${filter === 'disabled' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Disabled
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Provider</th>
              <th className="px-4 py-2 text-left">Model</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Latency</th>
              <th className="px-4 py-2 text-left">Availability (7d)</th>
              <th className="px-4 py-2 text-left">Enabled</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {monitors.map((monitor) => (
              <tr key={monitor.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">{monitor.name}</td>
                <td className="px-4 py-2">{monitor.provider}</td>
                <td className="px-4 py-2">{monitor.primary_model}</td>
                <td className={`px-4 py-2 ${getStatusColor(monitor.last_status)}`}>
                  {monitor.last_status}
                </td>
                <td className="px-4 py-2">
                  {monitor.last_latency_ms ? `${monitor.last_latency_ms}ms` : 'N/A'}
                </td>
                <td className="px-4 py-2">
                  {formatAvailability(monitor.availability_rate_7d)}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleToggleEnabled(monitor)}
                    className={`px-2 py-1 rounded text-sm ${
                      monitor.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {monitor.enabled ? 'Yes' : 'No'}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRunNow(monitor.id)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Run
                    </button>
                    <button
                      onClick={() => {/* TODO: Open edit dialog */}}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(monitor.id, monitor.name)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {monitors.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No monitors found. Create one to get started.
        </div>
      )}
    </div>
  );
}
