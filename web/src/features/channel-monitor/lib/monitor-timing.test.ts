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
import { describe, expect, it } from 'vitest'

import {
  timingDefaultsForApiMode,
  timingForApiModeChange,
} from './monitor-timing'

describe('channel monitor timing defaults', () => {
  it('uses longer defaults and timeout range for image probes', () => {
    expect(timingDefaultsForApiMode('image_generation')).toEqual({
      intervalSeconds: 300,
      timeoutSeconds: 90,
      maxTimeoutSeconds: 180,
    })
  })

  it('keeps the existing text defaults', () => {
    expect(timingDefaultsForApiMode('chat_completions')).toEqual({
      intervalSeconds: 60,
      timeoutSeconds: 10,
      maxTimeoutSeconds: 60,
    })
  })

  it('changes untouched defaults when switching modes', () => {
    expect(
      timingForApiModeChange('chat_completions', 'image_generation', 60, 10)
    ).toEqual({ intervalSeconds: 300, timeoutSeconds: 90 })
  })

  it('preserves administrator-customized values when switching modes', () => {
    expect(
      timingForApiModeChange('chat_completions', 'image_generation', 600, 45)
    ).toEqual({ intervalSeconds: 600, timeoutSeconds: 45 })
  })
})
