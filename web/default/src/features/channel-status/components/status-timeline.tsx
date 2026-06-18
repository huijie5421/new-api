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
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { MonitorTimelinePoint } from '../types'
import { formatLatency, timelineBar } from './status-helpers'

const MAX_BARS = 60

interface StatusTimelineProps {
  points: MonitorTimelinePoint[]
}

// Renders up to 60 vertical bars, oldest -> newest. The newest checks sit on
// the right; when there are fewer than 60 points the empty slots are rendered
// as muted placeholders on the LEFT.
export function StatusTimeline({ points }: StatusTimelineProps) {
  const { t } = useTranslation()

  // Keep only the most recent MAX_BARS, preserving ascending order.
  const recent = points.length > MAX_BARS ? points.slice(-MAX_BARS) : points
  const placeholders = Math.max(0, MAX_BARS - recent.length)

  return (
    <div className='bg-background/50 rounded-xl border p-3 backdrop-blur-sm'>
      <TooltipProvider delay={120}>
        <div className='flex h-10 items-end gap-px'>
          {Array.from({ length: placeholders }).map((_, i) => (
            <div
              key={`placeholder-${i}`}
              className='bg-muted h-1.5 min-w-px flex-1 rounded-full'
            />
          ))}
          {recent.map((point, i) => (
            <TimelineBar key={`${point.checked_at}-${i}`} point={point} />
          ))}
        </div>
      </TooltipProvider>
      <div className='text-muted-foreground mt-2 text-[11px] font-medium'>
        {t('Last 60 checks')}
      </div>
    </div>
  )
}

function statusLabel(status: string, t: (key: string) => string): string {
  if (status === 'success') return t('Up')
  if (status === 'failure') return t('Down')
  return t('Unknown')
}

function TimelineBar({ point }: { point: MonitorTimelinePoint }) {
  const { t } = useTranslation()
  const { heightPct, colorClass } = timelineBar(point.status, point.latency_ms)
  const relative = dayjs.unix(point.checked_at).fromNow()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className='flex h-full min-w-px flex-1 items-end'>
            <div
              className={cn('w-full rounded-full', colorClass)}
              style={{ height: `${heightPct}%` }}
            />
          </div>
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
