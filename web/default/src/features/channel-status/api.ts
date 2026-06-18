import { api } from '@/lib/api'
import type { MonitorStatusDetail, UserMonitorSummary } from './types'

const API_BASE = '/api/channel-monitors'

export const channelStatusAPI = {
  getAll: async () => {
    const response = await api.get<{
      success: boolean
      data: UserMonitorSummary[]
    }>(API_BASE)
    return response.data.data
  },

  getStatus: async (id: number) => {
    const response = await api.get<{
      success: boolean
      data: MonitorStatusDetail
    }>(`${API_BASE}/${id}`)
    return response.data.data
  },
}
