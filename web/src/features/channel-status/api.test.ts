import { describe, expect, it, vi } from 'vitest'

import { channelStatusAPI } from './api'

const { get } = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
}))

vi.mock('@/lib/api', () => ({ api: { get } }))

describe('channel status API paths', () => {
  it('uses the registered trailing-slash list route', async () => {
    await channelStatusAPI.getAll()
    expect(get).toHaveBeenCalledWith('/api/channel-monitors/')
  })
})
