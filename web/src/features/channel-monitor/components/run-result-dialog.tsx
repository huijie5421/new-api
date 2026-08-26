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
import { CheckCircle2, XCircle, Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

import { statusTone } from '../lib/status'
import type { MonitorRunResult } from '../types'

interface RunResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  monitorName?: string
  apiMode?: string
  result: MonitorRunResult | null
}

export function RunResultDialog({
  open,
  onOpenChange,
  monitorName,
  apiMode = '',
  result,
}: RunResultDialogProps) {
  const { t } = useTranslation()

  const results = result?.results ?? []
  const successCount = results.filter((r) => r.status === 'success').length
  const total = results.length
  const slowCount = results.filter(
    (r) => statusTone(r.status, r.latency_ms, apiMode) === 'warning'
  ).length

  let healthClassName = 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  if (successCount === total && slowCount === 0) {
    healthClassName = 'bg-success/15 text-success'
  } else if (successCount === 0) {
    healthClassName = 'bg-destructive/15 text-destructive'
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className='flex items-center gap-2'>
          <span className='flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm'>
            <Activity className='size-4 text-white' />
          </span>
          {t('Run Result')}
        </span>
      }
      description={
        monitorName
          ? t('Latest manual check for {{name}}', { name: monitorName })
          : t('Latest manual check')
      }
      contentClassName='sm:max-w-2xl'
      footer={
        <Button variant='outline' onClick={() => onOpenChange(false)}>
          {t('Close')}
        </Button>
      }
    >
      <div className='space-y-4'>
        {total > 0 && (
          <div className='flex items-center gap-3'>
            <Badge
              variant='outline'
              className='border-border gap-1.5 px-2.5 py-1'
            >
              <span className='text-muted-foreground'>{t('Models')}</span>
              <span className='font-semibold tabular-nums'>{total}</span>
            </Badge>
            <Badge className={cn('gap-1.5 px-2.5 py-1', healthClassName)}>
              {t('{{ok}}/{{total}} healthy', { ok: successCount, total })}
            </Badge>
          </div>
        )}

        {total === 0 ? (
          <div className='border-border text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-sm'>
            <Activity className='size-6 opacity-50' />
            {t('No results returned for this run.')}
          </div>
        ) : (
          <div className='border-border overflow-hidden rounded-xl border'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/50'>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className='text-right'>{t('Latency')}</TableHead>
                  <TableHead>{t('Message')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => {
                  const tone = statusTone(r.status, r.latency_ms, apiMode)
                  const ok = tone === 'success' || tone === 'warning'
                  let label = t('Failure')
                  if (tone === 'warning') {
                    label = t('Slow')
                  } else if (ok) {
                    label = t('Success')
                  }
                  return (
                    <TableRow
                      key={`${r.model}-${r.status}-${r.latency_ms}-${r.error_msg}`}
                    >
                      <TableCell className='font-medium'>{r.model}</TableCell>
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
                        {r.latency_ms > 0 ? `${r.latency_ms} ms` : '—'}
                      </TableCell>
                      <TableCell className='max-w-xs'>
                        {r.error_msg ? (
                          <span
                            className='text-destructive block truncate text-xs'
                            title={r.error_msg}
                          >
                            {r.error_msg}
                          </span>
                        ) : (
                          <span className='text-muted-foreground text-xs'>
                            {r.response_ok ? t('OK') : '—'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Dialog>
  )
}
