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
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

import type { MonitorTimelinePoint } from '../types'
import { formatLatency, timelineBar } from './status-helpers'

const MAX_BARS = 60

interface StatusTimelineProps {
  points: MonitorTimelinePoint[]
  apiMode?: string
}

// Uptime-style timeline: up to 60 uniform-height rounded bars, oldest -> newest.
// When there are fewer than 60 points the empty slots render as faint track
// segments on the LEFT. Status is encoded by color; latency shows on hover.
export function StatusTimeline({ points, apiMode = '' }: StatusTimelineProps) {
  const { t } = useTranslation()

  const recent = points.length > MAX_BARS ? points.slice(-MAX_BARS) : points
  const placeholders = Math.max(0, MAX_BARS - recent.length)
  const placeholderItems = Array.from({ length: placeholders }, (_, index) => ({
    id: `placeholder-${index}`,
  }))
  const upCount = recent.filter((p) => p.status === 'success').length
  const uptime = recent.length > 0 ? (upCount / recent.length) * 100 : null
  let uptimeClassName = 'text-rose-600 dark:text-rose-400'
  if (uptime !== null && uptime >= 99) {
    uptimeClassName = 'text-emerald-600 dark:text-emerald-400'
  } else if (uptime !== null && uptime >= 90) {
    uptimeClassName = 'text-amber-600 dark:text-amber-400'
  }

  return (
    <div className='bg-muted/30 rounded-lg border p-3'>
      <div className='mb-2 flex items-center justify-between'>
        <span className='text-muted-foreground text-[11px] font-medium uppercase'>
          {t('Last 60 checks')}
        </span>
        {uptime !== null && (
          <span
            className={cn(
              'text-[11px] font-semibold tabular-nums',
              uptimeClassName
            )}
          >
            {uptime.toFixed(0)}% {t('Up')}
          </span>
        )}
      </div>
      <TooltipProvider delay={100}>
        <div className='flex h-9 items-stretch gap-[2px]'>
          {placeholderItems.map((placeholder) => (
            <div
              key={placeholder.id}
              className='bg-muted/50 min-w-[2px] flex-1 rounded-[2px]'
            />
          ))}
          {recent.map((point) => (
            <TimelineBar
              key={point.checked_at}
              point={point}
              apiMode={apiMode}
            />
          ))}
        </div>
      </TooltipProvider>
    </div>
  )
}

function statusLabel(status: string, t: (key: string) => string): string {
  if (status === 'success') {
    return t('Up')
  }
  if (status === 'failure') {
    return t('Down')
  }
  return t('Unknown')
}

function TimelineBar({
  point,
  apiMode,
}: {
  point: MonitorTimelinePoint
  apiMode: string
}) {
  const { t } = useTranslation()
  const { colorClass } = timelineBar(point.status, point.latency_ms, apiMode)
  const relative = dayjs.unix(point.checked_at).fromNow()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              'min-w-[2px] flex-1 cursor-default rounded-[2px] transition-all duration-150 hover:brightness-125',
              colorClass
            )}
          />
        }
      />
      <TooltipContent>
        <div className='flex flex-col gap-0.5'>
          <span className='font-medium'>{relative}</span>
          <span>
            {statusLabel(point.status, t)} · {formatLatency(point.latency_ms)}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
