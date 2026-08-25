import type { StatusBadgeProps } from '@/components/status-badge'

import type { UsageLog } from '../data/schema'
import type { LogOtherData } from '../types'

export type CacheHitRateVariant = Extract<
  StatusBadgeProps['variant'],
  'success' | 'warning' | 'danger'
>

/**
 * Calculate the input-side cache hit rate as a percentage.
 * Cache writes are included in the denominator so a newly-created cache is
 * not presented as a hit.
 */
export function cacheHitRatePercent(
  inputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number
): number {
  const input = Math.max(0, Number(inputTokens) || 0)
  const read = Math.max(0, Number(cacheReadTokens) || 0)
  const write = Math.max(0, Number(cacheWriteTokens) || 0)
  const denominator = input + read + write
  if (denominator <= 0) return 0
  return Math.round(((read * 100) / denominator) * 100) / 100
}

export function cacheHitRateVariant(rate: number): CacheHitRateVariant {
  if (rate >= 70) return 'success'
  if (rate >= 50) return 'warning'
  return 'danger'
}

function cacheWriteTokens(other: LogOtherData | null): number {
  if (!other) return 0
  if (typeof other.cache_write_tokens === 'number') {
    return Math.max(0, other.cache_write_tokens)
  }
  const split =
    (other.cache_creation_tokens_5m || 0) +
    (other.cache_creation_tokens_1h || 0)
  return Math.max(0, split || other.cache_creation_tokens || 0)
}

/** Return null when a request contains no input-side token data. */
export function getLogCacheHitRate(
  log: Pick<UsageLog, 'prompt_tokens'>,
  other: LogOtherData | null
): number | null {
  const cacheRead = Math.max(0, other?.cache_tokens || 0)
  const cacheWrite = cacheWriteTokens(other)
  const rawInput =
    typeof other?.input_tokens_total === 'number'
      ? other.input_tokens_total
      : log.prompt_tokens || 0
  const isClaude = other?.usage_semantic === 'anthropic'
  const pureInput = isClaude
    ? Math.max(0, rawInput)
    : Math.max(0, rawInput - cacheRead - cacheWrite)
  if (pureInput + cacheRead + cacheWrite <= 0) return null
  return cacheHitRatePercent(pureInput, cacheRead, cacheWrite)
}
