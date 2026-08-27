/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { describe, expect, test } from 'vitest'

import type { DashboardFilters } from '@/features/dashboard/types'

import { buildQueryParams } from './filters'

const timeRange = { start_timestamp: 100, end_timestamp: 200 }

describe('dashboard query filters', () => {
  test('omits channels when all channels are selected', () => {
    expect(
      buildQueryParams(timeRange, {
        time_granularity: 'day',
        channel_ids: [],
      } as DashboardFilters)
    ).not.toHaveProperty('channel_ids')
  })

  test('serializes one selected channel', () => {
    expect(
      buildQueryParams(timeRange, {
        time_granularity: 'day',
        channel_ids: [146],
      } as DashboardFilters)
    ).toMatchObject({ channel_ids: '146' })
  })

  test('deduplicates and sorts selected channels', () => {
    expect(
      buildQueryParams(timeRange, {
        time_granularity: 'day',
        channel_ids: [147, 145, 146, 147],
      } as DashboardFilters)
    ).toMatchObject({ channel_ids: '145,146,147' })
  })
})
