import { Activity, RefreshCw, ServerOff } from 'lucide-react'
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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import { channelStatusAPI } from '../api'
import { StatusCard } from '../components/status-card'
import { StatusDetailDialog } from '../components/status-detail-dialog'
import type {
  MonitorStatusDetail,
  TimeWindow,
  UserMonitorSummary,
} from '../types'

const TIME_WINDOWS: TimeWindow[] = ['7d', '15d', '30d']
const REFRESH_INTERVALS = [30, 60, 120] as const
const AUTO_REFRESH_KEY = 'channel-status-auto-refresh'

interface AutoRefreshPrefs {
  enabled: boolean
  interval: number
}

function loadAutoRefreshPrefs(): AutoRefreshPrefs {
  try {
    const raw = localStorage.getItem(AUTO_REFRESH_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutoRefreshPrefs>
      const interval = REFRESH_INTERVALS.includes(parsed.interval as never)
        ? (parsed.interval as number)
        : 60
      return { enabled: !!parsed.enabled, interval }
    }
  } catch {
    /* ignore malformed prefs */
  }
  return { enabled: false, interval: 60 }
}

export default function ChannelStatusView() {
  const { t } = useTranslation()

  const [monitors, setMonitors] = useState<UserMonitorSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('7d')

  const initialPrefs = loadAutoRefreshPrefs()
  const [autoRefresh, setAutoRefresh] = useState(initialPrefs.enabled)
  const [interval, setIntervalSeconds] = useState<number>(initialPrefs.interval)
  const [countdown, setCountdown] = useState(initialPrefs.interval)

  // Detail dialog state.
  const [selected, setSelected] = useState<UserMonitorSummary | null>(null)
  const [detail, setDetail] = useState<MonitorStatusDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const loadMonitors = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) {
        setRefreshing(true)
      }
      try {
        const data = await channelStatusAPI.getAll()
        setMonitors(data)
      } catch (error) {
        console.error('Failed to load channel status:', error)
        toast.error(t('Failed to load channel status'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [t]
  )

  useEffect(() => {
    loadMonitors()
  }, [loadMonitors])

  // Persist auto-refresh preference.
  useEffect(() => {
    try {
      localStorage.setItem(
        AUTO_REFRESH_KEY,
        JSON.stringify({ enabled: autoRefresh, interval })
      )
    } catch {
      /* ignore quota errors */
    }
  }, [autoRefresh, interval])

  // Keep a ref to loadMonitors so the countdown interval stays stable.
  const loadRef = useRef(loadMonitors)
  loadRef.current = loadMonitors

  // Auto-refresh countdown; paused when the tab is hidden.
  useEffect(() => {
    if (!autoRefresh) {
      setCountdown(interval)
      return
    }
    setCountdown(interval)
    const id = window.setInterval(() => {
      if (document.hidden) {
        return
      }
      setCountdown((prev) => {
        if (prev <= 1) {
          loadRef.current({ silent: true })
          return interval
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [autoRefresh, interval])

  const handleSelect = useCallback(async (monitor: UserMonitorSummary) => {
    setSelected(monitor)
    setDialogOpen(true)
    setDetail(null)
    setDetailLoading(true)
    try {
      const data = await channelStatusAPI.getStatus(monitor.id)
      setDetail(data)
    } catch (error) {
      console.error('Failed to load channel detail:', error)
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // Overall status: degraded if any enabled monitor reports a failure.
  const hasFailure = monitors.some((m) => m.last_status === 'failure')
  const operational = monitors.length > 0 && !hasFailure

  return (
    <div className='mx-auto w-full max-w-7xl'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <section data-public-page-header className='space-y-4 border-b pb-5'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex min-w-0 items-center gap-3'>
              <span
                data-ai-icon
                className='flex size-11 shrink-0 items-center justify-center rounded-lg'
              >
                <Activity className='size-5' aria-hidden='true' />
              </span>
              <div className='min-w-0'>
                <h1 className='text-2xl font-semibold sm:text-3xl'>
                  {t('Channel Status')}
                </h1>
                <p className='text-muted-foreground mt-1.5 text-sm'>
                  {t('Real-time availability of API channels')}
                </p>
              </div>
            </div>

            {!loading && (
              <OverallStatusChip
                operational={operational}
                empty={monitors.length === 0}
              />
            )}
          </div>

          <div
            data-public-surface
            className='bg-card flex flex-col gap-3 rounded-lg border p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between'
          >
            {/* Window segmented control */}
            <div className='bg-muted/60 inline-flex w-fit items-center gap-1 rounded-md border p-0.5'>
              {TIME_WINDOWS.map((w) => (
                <button
                  key={w}
                  type='button'
                  onClick={() => setTimeWindow(w)}
                  className={cn(
                    'rounded-sm px-4 py-1.5 text-sm font-medium transition-all',
                    timeWindow === w
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
                  )}
                >
                  {t(w)}
                </button>
              ))}
            </div>

            {/* Refresh + auto-refresh */}
            <div className='flex flex-wrap items-center gap-3'>
              <div className='bg-background/70 flex items-center gap-2.5 rounded-md border px-3 py-1.5'>
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={(checked) => setAutoRefresh(!!checked)}
                />
                <span className='text-sm font-medium'>{t('Auto-refresh')}</span>
                {autoRefresh && (
                  <>
                    <div className='bg-muted/70 inline-flex items-center gap-0.5 rounded-md p-0.5'>
                      {REFRESH_INTERVALS.map((sec) => (
                        <button
                          key={sec}
                          type='button'
                          onClick={() => setIntervalSeconds(sec)}
                          className={cn(
                            'rounded px-2 py-0.5 text-xs font-medium transition-all',
                            interval === sec
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                    <span className='text-muted-foreground w-10 text-right font-mono text-xs tabular-nums'>
                      {countdown}s
                    </span>
                  </>
                )}
              </div>

              <Button
                variant='outline'
                onClick={() => loadMonitors({ silent: true })}
                disabled={refreshing}
              >
                <RefreshCw
                  className={cn('size-4', refreshing && 'animate-spin')}
                />
                {t('Refresh')}
              </Button>
            </div>
          </div>
        </section>

        {/* Content */}
        {loading && (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}
        {!loading && monitors.length === 0 && <EmptyState />}
        {!loading && monitors.length > 0 && (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {monitors.map((monitor) => (
              <StatusCard
                key={monitor.id}
                monitor={monitor}
                timeWindow={timeWindow}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>

      <StatusDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        monitor={selected}
        detail={detail}
        loading={detailLoading}
      />
    </div>
  )
}

function OverallStatusChip({
  operational,
  empty,
}: {
  operational: boolean
  empty: boolean
}) {
  const { t } = useTranslation()

  if (empty) {
    return (
      <span className='text-muted-foreground bg-muted inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium'>
        <span className='bg-muted-foreground/60 size-2 rounded-full' />
        {t('No data')}
      </span>
    )
  }

  if (operational) {
    return (
      <span className='inline-flex items-center gap-2 rounded-full bg-green-500/10 px-3 py-1.5 text-sm font-semibold text-green-600 dark:text-green-400'>
        <span className='relative flex size-2.5'>
          <span className='absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75' />
          <span className='relative inline-flex size-2.5 rounded-full bg-green-500' />
        </span>
        {t('Operational')}
      </span>
    )
  }

  return (
    <span className='inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400'>
      <span className='relative flex size-2.5'>
        <span className='absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75' />
        <span className='relative inline-flex size-2.5 rounded-full bg-amber-500' />
      </span>
      {t('Degraded')}
    </span>
  )
}

function CardSkeleton() {
  return (
    <Card data-public-surface>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-3'>
          <Skeleton className='size-10 rounded-lg' />
          <div className='flex-1 space-y-2'>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-3 w-1/2' />
          </div>
        </div>
        <Skeleton className='h-24 rounded-lg' />
        <div className='grid grid-cols-2 gap-3'>
          <Skeleton className='h-16 rounded-lg' />
          <Skeleton className='h-16 rounded-lg' />
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  const { t } = useTranslation()
  return (
    <Card data-public-surface className='border-dashed'>
      <CardContent className='flex flex-col items-center justify-center gap-3 py-16 text-center'>
        <div className='bg-muted flex size-14 items-center justify-center rounded-full'>
          <ServerOff className='text-muted-foreground size-7' />
        </div>
        <h3 className='text-base font-semibold'>
          {t('No channels configured by admin yet')}
        </h3>
        <p className='text-muted-foreground max-w-sm text-sm'>
          {t(
            'Once an administrator enables channel monitoring, live availability will appear here.'
          )}
        </p>
      </CardContent>
    </Card>
  )
}
