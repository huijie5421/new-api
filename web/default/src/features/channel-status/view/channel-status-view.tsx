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
import { Activity, RefreshCw, ServerOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { channelStatusAPI } from '../api'
import type { ChannelMonitor } from '../../channel-monitor/types'
import type { MonitorStatusDetail, TimeWindow } from '../types'
import { StatusCard } from '../components/status-card'
import { StatusDetailDialog } from '../components/status-detail-dialog'

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

  const [monitors, setMonitors] = useState<ChannelMonitor[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('7d')

  const initialPrefs = loadAutoRefreshPrefs()
  const [autoRefresh, setAutoRefresh] = useState(initialPrefs.enabled)
  const [interval, setIntervalSeconds] = useState<number>(initialPrefs.interval)
  const [countdown, setCountdown] = useState(initialPrefs.interval)

  // Detail dialog state.
  const [selected, setSelected] = useState<ChannelMonitor | null>(null)
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
      if (document.hidden) return
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

  const handleSelect = useCallback(async (monitor: ChannelMonitor) => {
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
    <div className='min-h-full p-4 sm:p-6'>
      <div className='mx-auto max-w-7xl space-y-6'>
        {/* Hero */}
        <Card className='relative overflow-hidden border-transparent shadow-lg'>
          <div className='pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10' />
          <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_55%)]' />
          <CardContent className='relative flex flex-col gap-5 p-6'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
              <div className='flex items-start gap-3'>
                <div className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg'>
                  <Activity className='size-6 text-white' />
                </div>
                <div>
                  <h1 className='text-2xl font-bold'>{t('Channel Status')}</h1>
                  <p className='text-muted-foreground text-sm'>
                    {t('Real-time availability of API channels')}
                  </p>
                </div>
              </div>

              {!loading && <OverallStatusChip operational={operational} empty={monitors.length === 0} />}
            </div>

            {/* Controls row */}
            <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
              {/* Window segmented control */}
              <div className='bg-muted/60 inline-flex w-fit items-center gap-1 rounded-lg p-1 backdrop-blur-sm'>
                {TIME_WINDOWS.map((w) => (
                  <button
                    key={w}
                    type='button'
                    onClick={() => setTimeWindow(w)}
                    className={cn(
                      'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                      timeWindow === w
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(w)}
                  </button>
                ))}
              </div>

              {/* Refresh + auto-refresh */}
              <div className='flex flex-wrap items-center gap-3'>
                <div className='bg-background/50 flex items-center gap-2.5 rounded-lg border px-3 py-1.5 backdrop-blur-sm'>
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
                  <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                  {t('Refresh')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {loading ? (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : monitors.length === 0 ? (
          <EmptyState />
        ) : (
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
    <Card className='border-transparent'>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-3'>
          <Skeleton className='size-10 rounded-xl' />
          <div className='flex-1 space-y-2'>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-3 w-1/2' />
          </div>
        </div>
        <Skeleton className='h-24 rounded-xl' />
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
    <Card className='border-dashed'>
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
