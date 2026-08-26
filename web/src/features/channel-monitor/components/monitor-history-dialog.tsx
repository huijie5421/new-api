import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  XCircle,
} from 'lucide-react'
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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { channelMonitorAPI } from '../api'
import { statusTone } from '../lib/status'
import type { ChannelMonitor, ChannelMonitorHistory } from '../types'

interface MonitorHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  monitor: ChannelMonitor | null
}

const PAGE_SIZE = 50

export function MonitorHistoryDialog({
  open,
  onOpenChange,
  monitor,
}: MonitorHistoryDialogProps) {
  const { t } = useTranslation()

  const [history, setHistory] = useState<ChannelMonitorHistory[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const monitorId = monitor?.id ?? null

  const loadHistory = useCallback(
    async (id: number, p: number) => {
      setLoading(true)
      try {
        const res = await channelMonitorAPI.getHistory(id, p, PAGE_SIZE)
        setHistory(res.data ?? [])
        setTotal(res.total ?? 0)
      } catch {
        toast.error(t('Failed to load history'))
        setHistory([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  // Reset to the first page each time the dialog opens for a monitor.
  useEffect(() => {
    if (!open || monitorId == null) {
      return
    }
    setPage(1)
    loadHistory(monitorId, 1)
  }, [open, monitorId, loadHistory])

  const goToPage = (next: number) => {
    if (monitorId == null) {
      return
    }
    setPage(next)
    loadHistory(monitorId, next)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className='flex items-center gap-2'>
          <span className='flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm'>
            <History className='size-4 text-white' />
          </span>
          {t('Check History')}
        </span>
      }
      description={
        monitor
          ? t('Recent check results for {{name}}', { name: monitor.name })
          : t('Recent check results')
      }
      contentClassName='sm:max-w-3xl'
      footer={
        <div className='flex w-full items-center justify-between gap-2'>
          <span className='text-muted-foreground text-xs tabular-nums'>
            {total > 0
              ? t('Page {{page}} of {{pages}} · {{total}} record(s)', {
                  page,
                  pages: totalPages,
                  total,
                })
              : t('No records')}
          </span>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => goToPage(page - 1)}
              disabled={!hasPrev || loading}
            >
              <ChevronLeft className='size-4' />
              {t('Previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => goToPage(page + 1)}
              disabled={!hasNext || loading}
            >
              {t('Next')}
              <ChevronRight className='size-4' />
            </Button>
          </div>
        </div>
      }
    >
      <div className='border-border overflow-hidden rounded-xl border'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/50 hover:bg-muted/50'>
              <TableHead>{t('Model')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead className='text-right'>{t('Latency')}</TableHead>
              <TableHead>{t('Message')}</TableHead>
              <TableHead>{t('Checked at')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow className='hover:bg-transparent'>
                <TableCell colSpan={5} className='py-0'>
                  <div className='text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm'>
                    <Loader2 className='size-4 animate-spin' />
                    {t('Loading...')}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading && history.length === 0 && (
              <TableRow className='hover:bg-transparent'>
                <TableCell colSpan={5} className='py-0'>
                  <div className='text-muted-foreground flex flex-col items-center justify-center gap-2 py-12 text-sm'>
                    <History className='size-6 opacity-50' />
                    {t('No check history yet.')}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              history.length > 0 &&
              history.map((row) => {
                const tone = statusTone(
                  row.status,
                  row.latency_ms,
                  monitor?.api_mode ?? ''
                )
                const ok = tone === 'success' || tone === 'warning'
                let label = t('Failure')
                if (tone === 'warning') {
                  label = t('Slow')
                } else if (ok) {
                  label = t('Success')
                }
                return (
                  <TableRow key={row.id}>
                    <TableCell className='font-mono text-xs'>
                      {row.model || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          'gap-1',
                          tone === 'success' && 'bg-success/15 text-success',
                          tone === 'warning' &&
                            'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                          tone === 'failure' &&
                            'bg-destructive/15 text-destructive'
                        )}
                      >
                        {ok ? (
                          <CheckCircle2 className='size-3' />
                        ) : (
                          <XCircle className='size-3' />
                        )}
                        {label}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {row.latency_ms > 0 ? `${row.latency_ms} ms` : '—'}
                    </TableCell>
                    <TableCell className='max-w-xs'>
                      {row.error_msg ? (
                        <span
                          className='text-destructive block truncate text-xs'
                          title={row.error_msg}
                        >
                          {row.error_msg}
                        </span>
                      ) : (
                        <span className='text-muted-foreground text-xs'>—</span>
                      )}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                      {row.checked_at
                        ? new Date(row.checked_at * 1000).toLocaleString()
                        : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </div>
    </Dialog>
  )
}
