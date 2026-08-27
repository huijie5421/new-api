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
import { useQuery } from '@tanstack/react-query'

import { getChannels } from '@/features/channels/api'

const CHANNEL_PAGE_SIZE = 100

export function useDashboardChannels(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'channels'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const firstPage = await getChannels({
        p: 1,
        page_size: CHANNEL_PAGE_SIZE,
        status: '',
      })
      if (!firstPage.success) {
        throw new Error(firstPage.message || 'Failed to load channels')
      }
      const firstData = firstPage.data
      const total = firstData?.total ?? firstData?.items.length ?? 0
      const pageCount = Math.ceil(total / CHANNEL_PAGE_SIZE)
      if (pageCount <= 1) return firstData?.items ?? []

      const remainingPages = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, index) =>
          getChannels({
            p: index + 2,
            page_size: CHANNEL_PAGE_SIZE,
            status: '',
          })
        )
      )
      if (remainingPages.some((page) => !page.success)) {
        throw new Error('Failed to load channels')
      }
      return [
        ...(firstData?.items ?? []),
        ...remainingPages.flatMap((page) => page.data?.items ?? []),
      ]
    },
  })
}
