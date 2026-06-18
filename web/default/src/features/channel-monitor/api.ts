import { api } from '@/lib/api'
import type {
  ChannelMonitor,
  ChannelMonitorHistory,
  ChannelMonitorTemplate,
  MonitorRunResult,
  TemplateApplyRequest,
} from './types'

const API_BASE = '/api/admin/channel-monitors'

export const channelMonitorAPI = {
  // Monitors
  getAll: async (enabled?: boolean) => {
    const params = enabled !== undefined ? { enabled } : {}
    const response = await api.get<{ success: boolean; data: ChannelMonitor[] }>(
      API_BASE,
      { params }
    )
    return response.data.data
  },

  getOne: async (id: number) => {
    const response = await api.get<{ success: boolean; data: ChannelMonitor }>(
      `${API_BASE}/${id}`
    )
    return response.data.data
  },

  create: async (monitor: Partial<ChannelMonitor>) => {
    const response = await api.post<{ success: boolean; data: ChannelMonitor }>(
      API_BASE,
      monitor
    )
    return response.data.data
  },

  update: async (id: number, monitor: Partial<ChannelMonitor>) => {
    const response = await api.put<{ success: boolean; data: ChannelMonitor }>(
      `${API_BASE}/${id}`,
      monitor
    )
    return response.data.data
  },

  delete: async (id: number) => {
    await api.delete(`${API_BASE}/${id}`)
  },

  runNow: async (id: number) => {
    const response = await api.post<{ success: boolean; data: MonitorRunResult }>(
      `${API_BASE}/${id}/run`
    )
    return response.data.data
  },

  getHistory: async (id: number, page = 1, pageSize = 50) => {
    const response = await api.get<{
      success: boolean
      data: ChannelMonitorHistory[]
      total: number
      page: number
    }>(`${API_BASE}/${id}/history`, {
      params: { page, page_size: pageSize },
    })
    return response.data
  },

  // Templates
  getAllTemplates: async (provider?: string) => {
    const params = provider ? { provider } : {}
    const response = await api.get<{
      success: boolean
      data: ChannelMonitorTemplate[]
    }>(`${API_BASE}/templates`, { params })
    return response.data.data
  },

  getTemplate: async (id: number) => {
    const response = await api.get<{
      success: boolean
      data: ChannelMonitorTemplate
    }>(`${API_BASE}/templates/${id}`)
    return response.data.data
  },

  createTemplate: async (template: Partial<ChannelMonitorTemplate>) => {
    const response = await api.post<{
      success: boolean
      data: ChannelMonitorTemplate
    }>(`${API_BASE}/templates`, template)
    return response.data.data
  },

  updateTemplate: async (id: number, template: Partial<ChannelMonitorTemplate>) => {
    const response = await api.put<{
      success: boolean
      data: ChannelMonitorTemplate
    }>(`${API_BASE}/templates/${id}`, template)
    return response.data.data
  },

  deleteTemplate: async (id: number) => {
    await api.delete(`${API_BASE}/templates/${id}`)
  },

  getTemplateMonitors: async (id: number) => {
    const response = await api.get<{ success: boolean; data: ChannelMonitor[] }>(
      `${API_BASE}/templates/${id}/monitors`
    )
    return response.data.data
  },

  applyTemplate: async (request: TemplateApplyRequest) => {
    await api.post(`${API_BASE}/templates/apply`, request)
  },
}
