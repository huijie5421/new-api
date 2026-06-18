import axios from 'axios';
import type { ChannelMonitor } from '../channel-monitor/types';
import type { MonitorStatusDetail } from './types';

const API_BASE = '/api/channel-monitors';

export const channelStatusAPI = {
  getAll: async () => {
    const response = await axios.get<{ success: boolean; data: ChannelMonitor[] }>(
      API_BASE
    );
    return response.data.data;
  },

  getStatus: async (id: number) => {
    const response = await axios.get<{ success: boolean; data: MonitorStatusDetail }>(
      `${API_BASE}/${id}`
    );
    return response.data.data;
  },
};
