import { describe, expect, it, vi } from 'vitest'

import { channelMonitorAPI } from './api'

const { get } = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
}))

vi.mock('@/lib/api', () => ({ api: { get } }))

describe('channel monitor API paths', () => {
  it('uses the registered trailing-slash list route', async () => {
    await channelMonitorAPI.getAll()
    expect(get).toHaveBeenCalledWith('/api/admin/channel-monitors/', {
      params: {},
    })
  })
})
