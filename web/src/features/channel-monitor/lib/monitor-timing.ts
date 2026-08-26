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

export interface MonitorTimingDefaults {
  intervalSeconds: number
  timeoutSeconds: number
  maxTimeoutSeconds: number
}

const TEXT_DEFAULTS: MonitorTimingDefaults = {
  intervalSeconds: 60,
  timeoutSeconds: 10,
  maxTimeoutSeconds: 60,
}

const IMAGE_DEFAULTS: MonitorTimingDefaults = {
  intervalSeconds: 300,
  timeoutSeconds: 90,
  maxTimeoutSeconds: 180,
}

export function timingDefaultsForApiMode(
  apiMode: string
): MonitorTimingDefaults {
  return apiMode === 'image_generation' ? IMAGE_DEFAULTS : TEXT_DEFAULTS
}

export function timingForApiModeChange(
  previousApiMode: string,
  nextApiMode: string,
  intervalSeconds: number,
  timeoutSeconds: number
): Pick<MonitorTimingDefaults, 'intervalSeconds' | 'timeoutSeconds'> {
  const previous = timingDefaultsForApiMode(previousApiMode)
  const next = timingDefaultsForApiMode(nextApiMode)
  return {
    intervalSeconds:
      intervalSeconds === previous.intervalSeconds
        ? next.intervalSeconds
        : intervalSeconds,
    timeoutSeconds:
      timeoutSeconds === previous.timeoutSeconds
        ? next.timeoutSeconds
        : timeoutSeconds,
  }
}
