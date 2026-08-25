import { describe, expect, test } from 'vitest'

import { calculateDashboardStats } from './stats'

describe('dashboard cache statistics', () => {
  test('aggregates cache-aware token fields and computes hit rate', () => {
    const stats = calculateDashboardStats([
      {
        created_at: 1,
        count: 1,
        quota: 10,
        token_used: 200,
        input_tokens: 100,
        cache_read_tokens: 70,
        cache_write_tokens: 30,
      },
    ])

    expect(stats.totalInputTokens).toBe(100)
    expect(stats.totalCacheReadTokens).toBe(70)
    expect(stats.totalCacheWriteTokens).toBe(30)
    expect(stats.cacheHitRate).toBe(35)
  })
})
