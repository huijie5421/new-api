/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { QuotaDataItem } from '@/features/dashboard/types'

/**
 * Safe division: handles NaN and Infinity cases
 */
export function safeDivide(
  value: number,
  divisor: number,
  precision: number = 3
): number {
  const result = value / divisor
  if (isNaN(result) || !isFinite(result)) return 0
  const factor = Math.pow(10, precision)
  return Math.round(result * factor) / factor
}

/**
 * Calculate aggregated statistics from quota data
 */
export function calculateDashboardStats(data: QuotaDataItem[]) {
  const totals = data.reduce(
    (acc, item) => ({
      totalQuota: acc.totalQuota + (Number(item.quota) || 0),
      totalCount: acc.totalCount + (Number(item.count) || 0),
      // token_used 已是缓存感知的总数（纯输入 + 输出 + 缓存写入 + 缓存读取）。
      totalTokens: acc.totalTokens + (Number(item.token_used) || 0),
      totalInputTokens: acc.totalInputTokens + (Number(item.input_tokens) || 0),
      totalCacheWriteTokens:
        acc.totalCacheWriteTokens + (Number(item.cache_write_tokens) || 0),
      totalCacheReadTokens:
        acc.totalCacheReadTokens + (Number(item.cache_read_tokens) || 0),
    }),
    {
      totalQuota: 0,
      totalCount: 0,
      totalTokens: 0,
      totalInputTokens: 0,
      totalCacheWriteTokens: 0,
      totalCacheReadTokens: 0,
    }
  )

  // 缓存命中率（参照 sub2）：缓存读取 / (纯输入 + 缓存读取 + 缓存写入) × 100，仅统计输入侧。
  const cacheDenominator =
    totals.totalInputTokens +
    totals.totalCacheReadTokens +
    totals.totalCacheWriteTokens
  const cacheHitRate =
    cacheDenominator > 0
      ? safeDivide(totals.totalCacheReadTokens * 100, cacheDenominator, 2)
      : 0

  return { ...totals, cacheHitRate }
}
