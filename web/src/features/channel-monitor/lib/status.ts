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

export const IMAGE_SLOW_LATENCY_MS = 60_000

export type MonitorStatusTone = 'success' | 'warning' | 'failure' | 'unknown'

export function statusTone(
  status: string,
  latencyMs: number | null | undefined,
  apiMode: string
): MonitorStatusTone {
  if (status === 'failure') {
    return 'failure'
  }
  if (status !== 'success') {
    return 'unknown'
  }
  if (
    apiMode === 'image_generation' &&
    latencyMs != null &&
    latencyMs >= IMAGE_SLOW_LATENCY_MS
  ) {
    return 'warning'
  }
  return 'success'
}
