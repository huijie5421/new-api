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

import { statusTone } from './status'

describe('channel monitor status tone', () => {
  it('marks image success under 60 seconds as green', () => {
    expect(statusTone('success', 59_999, 'image_generation')).toBe('success')
  })

  it('marks image success at 60 seconds as yellow', () => {
    expect(statusTone('success', 60_000, 'image_generation')).toBe('warning')
  })

  it('marks image failures red regardless of latency', () => {
    expect(statusTone('failure', 1_000, 'image_generation')).toBe('failure')
  })

  it('keeps text success green at 60 seconds', () => {
    expect(statusTone('success', 60_000, 'chat_completions')).toBe('success')
  })

  it('keeps unknown status neutral', () => {
    expect(statusTone('unknown', 0, 'image_generation')).toBe('unknown')
  })
})
