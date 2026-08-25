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
import type { TimeWindow, UserMonitorSummary } from '../types'

// Per-provider gradient + glow used for the card icon tile. Falls back to a
// neutral slate gradient for unknown providers.
export const PROVIDER_GRADIENTS: Record<string, string> = {
  openai: 'from-emerald-500 to-teal-600',
  anthropic: 'from-orange-500 to-amber-600',
  gemini: 'from-blue-500 to-indigo-600',
  grok: 'from-zinc-600 to-neutral-900',
  azure: 'from-sky-500 to-cyan-600',
  default: 'from-slate-500 to-slate-700',
}

export function providerGradient(provider: string): string {
  return (
    PROVIDER_GRADIENTS[provider?.toLowerCase()] ?? PROVIDER_GRADIENTS.default
  )
}

// Read the availability rate (0..1 | null) for the selected window.
export function availabilityForWindow(
  monitor: UserMonitorSummary,
  window: TimeWindow
): number | null {
  switch (window) {
    case '7d':
      return monitor.availability_rate_7d
    case '15d':
      return monitor.availability_rate_15d
    case '30d':
      return monitor.availability_rate_30d
    default:
      return null
  }
}

// Map a 0..1 availability rate onto an HSL color: 0 -> red (hue 0),
// 1 -> green (hue 120). null/undefined renders muted.
export function availabilityHsl(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) {
    return 'var(--muted-foreground)'
  }
  const clamped = Math.min(Math.max(rate, 0), 1)
  const hue = clamped * 120
  return `hsl(${hue} 70% 45%)`
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) {
    return 'N/A'
  }
  return `${(rate * 100).toFixed(1)}%`
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms <= 0) {
    return 'N/A'
  }
  return `${ms} ms`
}

// Latency (ms) above which a *successful* check is still considered slow.
export const SLOW_LATENCY_MS = 6000

// Map a single timeline point onto an uptime-style bar color. Bars are uniform
// height (cleaner status-page look); status is encoded purely by color:
//   success & fast  -> emerald
//   success & slow  -> amber
//   failure/unknown -> rose
export function timelineBar(
  status: string,
  latencyMs: number
): { colorClass: string } {
  if (status === 'success') {
    if (latencyMs >= SLOW_LATENCY_MS) {
      return { colorClass: 'bg-amber-400 dark:bg-amber-500' }
    }
    return { colorClass: 'bg-emerald-500 dark:bg-emerald-400' }
  }
  return { colorClass: 'bg-rose-500 dark:bg-rose-400' }
}
