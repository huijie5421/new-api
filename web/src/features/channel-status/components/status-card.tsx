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
import {
  Activity,
  CheckCircle2,
  Clock,
  Gauge,
  Server,
  XCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { TimeWindow, UserMonitorSummary } from '../types'
import {
  availabilityForWindow,
  availabilityHsl,
  formatLatency,
  formatPercent,
  providerGradient,
} from './status-helpers'
import { StatusTimeline } from './status-timeline'

interface StatusCardProps {
  monitor: UserMonitorSummary
  timeWindow: TimeWindow
  onSelect: (monitor: UserMonitorSummary) => void
}

export function StatusCard({ monitor, timeWindow, onSelect }: StatusCardProps) {
  const { t } = useTranslation()

  const availability = availabilityForWindow(monitor, timeWindow)
  const color = availabilityHsl(availability)
  const isUp = monitor.last_status === 'success'
  const isDown = monitor.last_status === 'failure'

  return (
    <Card
      data-public-surface
      data-public-interactive
      onClick={() => onSelect(monitor)}
      className='group/status relative cursor-pointer overflow-hidden shadow-xs'
    >
      <CardContent className='flex flex-col gap-4'>
        {/* Header: provider icon + name + status chip */}
        <div className='flex items-start gap-3'>
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br shadow-sm',
              providerGradient(monitor.provider)
            )}
          >
            <Server className='size-5 text-white' />
          </div>
          <div className='min-w-0 flex-1'>
            <h3 className='truncate text-sm font-bold' title={monitor.name}>
              {monitor.name}
            </h3>
            <div className='mt-1 flex flex-wrap items-center gap-1.5'>
              <Badge variant='secondary' className='capitalize'>
                {monitor.provider || t('Unknown')}
              </Badge>
              <span
                className='text-muted-foreground max-w-[10rem] truncate font-mono text-[11px]'
                title={monitor.primary_model}
              >
                {monitor.primary_model}
              </span>
            </div>
          </div>
          <StatusChip up={isUp} down={isDown} />
        </div>

        {/* Big availability number */}
        <div className='bg-muted/25 rounded-lg border p-4'>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <Activity className='size-3.5' />
              {t('Availability')} · {timeWindow}
            </span>
          </div>
          <div
            className='mt-1 text-3xl font-bold tabular-nums'
            style={{ color }}
          >
            {formatPercent(availability)}
          </div>
          <div className='bg-muted mt-3 h-2 w-full overflow-hidden rounded-full'>
            <div
              className='h-full rounded-full transition-all duration-500'
              style={{
                width: availability === null ? '0%' : `${availability * 100}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>

        {/* Check timeline (primary model, last 60 checks) */}
        <StatusTimeline points={monitor.timeline ?? []} />

        {/* Metrics row */}
        <div className='grid grid-cols-2 gap-3'>
          <div className='bg-background/65 rounded-lg border p-3'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <Gauge className='size-3' />
              {t('Latency')}
            </div>
            <div className='mt-1.5 text-base font-semibold tabular-nums'>
              {formatLatency(monitor.last_latency_ms)}
            </div>
          </div>
          <div className='bg-background/65 rounded-lg border p-3'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <Clock className='size-3' />
              {t('Last check')}
            </div>
            <div className='mt-1.5 text-base font-semibold tabular-nums'>
              {monitor.last_check_at
                ? new Date(monitor.last_check_at * 1000).toLocaleTimeString()
                : t('Never')}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusChip({ up, down }: { up: boolean; down: boolean }) {
  const { t } = useTranslation()

  if (up) {
    return (
      <span className='inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400'>
        <CheckCircle2 className='size-3' />
        {t('Up')}
      </span>
    )
  }
  if (down) {
    return (
      <span className='inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400'>
        <XCircle className='size-3' />
        {t('Down')}
      </span>
    )
  }
  return (
    <span className='text-muted-foreground bg-muted inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium'>
      <span className='bg-muted-foreground/60 size-2 rounded-full' />
      {t('Unknown')}
    </span>
  )
}
