import { describe, expect, test } from 'vitest'

import { cacheHitRatePercent, cacheHitRateVariant } from './cache-hit-rate'

describe('cache hit rate', () => {
  test('uses input plus cache read/write tokens as the denominator', () => {
    expect(cacheHitRatePercent(100, 70, 30)).toBe(35)
    expect(cacheHitRatePercent(0, 0, 0)).toBe(0)
  })

  test('maps the requested thresholds to green, yellow, and red', () => {
    expect(cacheHitRateVariant(70)).toBe('success')
    expect(cacheHitRateVariant(50)).toBe('warning')
    expect(cacheHitRateVariant(49.99)).toBe('danger')
  })
})
