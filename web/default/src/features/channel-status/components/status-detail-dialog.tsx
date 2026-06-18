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
import { Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { MonitorStatusDetail, UserMonitorSummary } from '../types'
import {
  availabilityHsl,
  formatLatency,
  formatPercent,
  providerGradient,
} from './status-helpers'

interface StatusDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  monitor: UserMonitorSummary | null
  detail: MonitorStatusDetail | null
  loading: boolean
}

export function StatusDetailDialog({
  open,
  onOpenChange,
  monitor,
  detail,
  loading,
}: StatusDetailDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-3'>
            {monitor && (
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow',
                  providerGradient(monitor.provider)
                )}
              >
                <Server className='size-4 text-white' />
              </div>
            )}
            <span className='truncate'>{monitor?.name ?? t('Channel detail')}</span>
          </DialogTitle>
          <DialogDescription>
            {t('Per-model availability and latency across recent windows.')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className='space-y-2'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className='h-16 rounded-lg' />
            ))}
          </div>
        ) : !detail || detail.models.length === 0 ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>
            {t('No model statistics available yet.')}
          </p>
        ) : (
          <div className='-mr-1 max-h-[60vh] space-y-3 overflow-y-auto pr-1'>
            {detail.models.map((model, idx) => (
              <div
                key={`${model.model}-${idx}`}
                className='bg-background/50 rounded-xl border p-4 backdrop-blur-sm'
              >
                <div className='mb-3 flex items-center justify-between gap-2'>
                  <span
                    className='truncate font-mono text-sm font-medium'
                    title={model.model}
                  >
                    {model.model}
                  </span>
                  {idx === 0 && (
                    <Badge variant='outline' className='shrink-0'>
                      {t('Primary')}
                    </Badge>
                  )}
                </div>
                <div className='grid grid-cols-3 gap-2'>
                  <WindowStat
                    label={t('7d')}
                    rate={model.availability_7d}
                    latency={model.avg_latency_7d}
                  />
                  <WindowStat
                    label={t('15d')}
                    rate={model.availability_15d}
                    latency={model.avg_latency_15d}
                  />
                  <WindowStat
                    label={t('30d')}
                    rate={model.availability_30d}
                    latency={model.avg_latency_30d}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function WindowStat({
  label,
  rate,
  latency,
}: {
  label: string
  rate: number
  latency: number
}) {
  const { t } = useTranslation()
  return (
    <div className='bg-muted/40 rounded-lg p-2.5 text-center'>
      <div className='text-muted-foreground text-[11px] font-medium'>{label}</div>
      <div
        className='mt-0.5 text-lg font-bold tabular-nums'
        style={{ color: availabilityHsl(rate) }}
      >
        {formatPercent(rate)}
      </div>
      <div className='text-muted-foreground mt-0.5 text-[11px] tabular-nums'>
        {latency > 0 ? formatLatency(latency) : t('No data')}
      </div>
    </div>
  )
}
