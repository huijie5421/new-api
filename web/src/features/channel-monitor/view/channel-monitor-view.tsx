import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileStack,
  Gauge,
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { channelMonitorAPI } from '../api'
import { MonitorFormDialog } from '../components/monitor-form-dialog'
import { MonitorHistoryDialog } from '../components/monitor-history-dialog'
import { RunResultDialog } from '../components/run-result-dialog'
import { TemplateManagerDialog } from '../components/template-manager-dialog'
import { statusTone } from '../lib/status'
import type { ChannelMonitor, MonitorRunResult } from '../types'

const PROVIDER_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All providers' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'grok', label: 'Grok' },
]

const ENABLED_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

const PROVIDER_BADGE: Record<string, string> = {
  openai: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  anthropic: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  gemini: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  grok: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
}

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  grok: 'Grok',
}

function formatAvailability(rate: number | null): string {
  if (rate === null || rate === undefined) {
    return '—'
  }
  return `${(rate * 100).toFixed(1)}%`
}

function StatusBadge({
  status,
  latencyMs,
  apiMode,
}: {
  status: string
  latencyMs: number | null
  apiMode: string
}) {
  const { t } = useTranslation()
  const tone = statusTone(status, latencyMs, apiMode)
  if (tone === 'success') {
    return <Badge className='bg-success/15 text-success'>{t('Success')}</Badge>
  }
  if (tone === 'warning') {
    return (
      <Badge className='bg-amber-500/15 text-amber-600 dark:text-amber-400'>
        {t('Slow')}
      </Badge>
    )
  }
  if (tone === 'failure') {
    return (
      <Badge className='bg-destructive/15 text-destructive'>
        {t('Failure')}
      </Badge>
    )
  }
  return (
    <Badge variant='outline' className='text-muted-foreground'>
      {t('Unknown')}
    </Badge>
  )
}

export default function ChannelMonitorView() {
  const { t } = useTranslation()
  const [monitors, setMonitors] = useState<ChannelMonitor[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [enabledFilter, setEnabledFilter] = useState('all')

  // form dialog
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ChannelMonitor | null>(null)

  // template manager dialog
  const [templatesOpen, setTemplatesOpen] = useState(false)

  // history dialog
  const [historyTarget, setHistoryTarget] = useState<ChannelMonitor | null>(
    null
  )

  // run-result dialog
  const [runOpen, setRunOpen] = useState(false)
  const [runResult, setRunResult] = useState<MonitorRunResult | null>(null)
  const [runMonitorName, setRunMonitorName] = useState<string>('')
  const [runApiMode, setRunApiMode] = useState<string>('')
  const [runningId, setRunningId] = useState<number | null>(null)

  // delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ChannelMonitor | null>(null)
  const [deleting, setDeleting] = useState(false)

  // inline toggle state
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const loadMonitors = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      try {
        const enabled =
          enabledFilter === 'all' ? undefined : enabledFilter === 'enabled'
        const data = await channelMonitorAPI.getAll(enabled)
        setMonitors(data)
      } catch {
        toast.error(t('Failed to load monitors'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [enabledFilter, t]
  )

  useEffect(() => {
    loadMonitors()
  }, [loadMonitors])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return monitors.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false
      if (providerFilter !== 'all' && m.provider !== providerFilter) {
        return false
      }
      return true
    })
  }, [monitors, search, providerFilter])

  const monitorSummary = useMemo(() => {
    const enabled = monitors.filter((monitor) => monitor.enabled).length
    const healthy = monitors.filter(
      (monitor) =>
        statusTone(
          monitor.last_status,
          monitor.last_latency_ms,
          monitor.api_mode
        ) === 'success'
    ).length
    const latencies = monitors
      .map((monitor) => monitor.last_latency_ms)
      .filter((value): value is number => value != null)
    const averageLatency = latencies.length
      ? Math.round(
          latencies.reduce((total, value) => total + value, 0) /
            latencies.length
        )
      : null

    return { enabled, healthy, averageLatency }
  }, [monitors])

  const handleToggleEnabled = async (monitor: ChannelMonitor) => {
    setTogglingId(monitor.id)
    // optimistic update
    setMonitors((prev) =>
      prev.map((m) => (m.id === monitor.id ? { ...m, enabled: !m.enabled } : m))
    )
    try {
      await channelMonitorAPI.update(monitor.id, {
        ...monitor,
        enabled: !monitor.enabled,
      })
      toast.success(
        monitor.enabled ? t('Monitor disabled') : t('Monitor enabled')
      )
      // refresh quietly so server-derived fields stay accurate
      loadMonitors({ silent: true })
    } catch {
      // revert on failure
      setMonitors((prev) =>
        prev.map((m) =>
          m.id === monitor.id ? { ...m, enabled: monitor.enabled } : m
        )
      )
      toast.error(t('Failed to update monitor'))
    } finally {
      setTogglingId(null)
    }
  }

  const handleRun = async (monitor: ChannelMonitor) => {
    setRunningId(monitor.id)
    try {
      const result = await channelMonitorAPI.runNow(monitor.id)
      setRunResult(result)
      setRunMonitorName(monitor.name)
      setRunApiMode(monitor.api_mode)
      setRunOpen(true)
      const ok = result.results.filter((r) => r.status === 'success').length
      const total = result.results.length
      if (total > 0 && ok === total) {
        toast.success(t('All {{total}} checks passed', { total }))
      } else if (total > 0) {
        toast.warning(t('{{ok}} of {{total}} checks passed', { ok, total }))
      }
      loadMonitors({ silent: true })
    } catch {
      toast.error(t('Failed to run monitor'))
    } finally {
      setRunningId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) {
      return
    }
    setDeleting(true)
    try {
      await channelMonitorAPI.delete(deleteTarget.id)
      toast.success(t('Monitor deleted'))
      setDeleteTarget(null)
      loadMonitors({ silent: true })
    } catch {
      toast.error(t('Failed to delete monitor'))
    } finally {
      setDeleting(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (monitor: ChannelMonitor) => {
    setEditing(monitor)
    setFormOpen(true)
  }

  const columnCount = 8

  return (
    <div className='h-full space-y-6 overflow-y-auto p-4 sm:p-6'>
      {/* Header */}
      <Card className='channel-monitor-hero overflow-hidden'>
        <div className='relative overflow-hidden'>
          <CardContent className='relative flex flex-col gap-6 p-5 sm:p-6'>
            <div className='flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between'>
              <div className='flex items-start gap-3'>
                <div className='channel-monitor-hero-icon flex size-11 shrink-0 items-center justify-center rounded-xl shadow-lg'>
                  <Activity className='size-5' />
                </div>
                <div>
                  <div className='text-primary mb-1 text-[11px] font-semibold tracking-[0.2em] uppercase'>
                    {t('Operations / V1 probe')}
                  </div>
                  <h1 className='text-2xl font-semibold tracking-tight'>
                    {t('Channel Monitors')}
                  </h1>
                  <div className='mt-1 flex flex-wrap items-center gap-2'>
                    <Badge variant='outline' className='text-xs'>
                      {t('V1 Active Probe')}
                    </Badge>
                    <p className='text-muted-foreground text-sm'>
                      {t(
                        'Track upstream channel availability and latency over time.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className='channel-monitor-summary grid grid-cols-3 gap-2 sm:gap-3'>
                <div className='channel-monitor-summary-item'>
                  <ShieldCheck className='text-success size-4' />
                  <strong>{monitorSummary.healthy}</strong>
                  <span>{t('Healthy')}</span>
                </div>
                <div className='channel-monitor-summary-item'>
                  <CheckCircle2 className='text-primary size-4' />
                  <strong>{monitorSummary.enabled}</strong>
                  <span>{t('Enabled')}</span>
                </div>
                <div className='channel-monitor-summary-item'>
                  <Gauge className='text-warning size-4' />
                  <strong>
                    {monitorSummary.averageLatency != null
                      ? `${monitorSummary.averageLatency}ms`
                      : '—'}
                  </strong>
                  <span>{t('Avg latency')}</span>
                </div>
              </div>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button variant='outline' onClick={() => setTemplatesOpen(true)}>
                <FileStack className='size-4' />
                {t('Templates')}
              </Button>
              <Button onClick={openCreate}>
                <Plus className='size-4' />
                {t('Create Monitor')}
              </Button>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* Filters */}
      <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
        <div className='relative w-full sm:max-w-xs'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search by name')}
            className='pl-8'
          />
        </div>

        <Select
          items={PROVIDER_FILTERS.map((p) => ({
            value: p.value,
            label: t(p.label),
          }))}
          value={providerFilter}
          onValueChange={(value) => setProviderFilter(value ?? '')}
        >
          <SelectTrigger className='w-full sm:w-44'>
            <SelectValue placeholder={t('All providers')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {PROVIDER_FILTERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {t(p.label)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          items={ENABLED_FILTERS.map((p) => ({
            value: p.value,
            label: t(p.label),
          }))}
          value={enabledFilter}
          onValueChange={(value) => setEnabledFilter(value ?? '')}
        >
          <SelectTrigger className='w-full sm:w-36'>
            <SelectValue placeholder={t('All')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {ENABLED_FILTERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {t(p.label)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={() => loadMonitors({ silent: true })}
                disabled={refreshing}
                aria-label={t('Refresh')}
                className='sm:ml-auto'
              />
            }
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </TooltipTrigger>
          <TooltipContent>{t('Refresh')}</TooltipContent>
        </Tooltip>
      </div>

      {/* Table */}
      <Card className='overflow-hidden py-0'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/50 hover:bg-muted/50'>
              <TableHead>{t('Name')}</TableHead>
              <TableHead>{t('Provider')}</TableHead>
              <TableHead>{t('Primary Model')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead className='text-right'>{t('Latency')}</TableHead>
              <TableHead className='text-right'>
                {t('Availability (7d)')}
              </TableHead>
              <TableHead className='text-center'>{t('Enabled')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              ['one', 'two', 'three', 'four', 'five'].map((rowKey) => (
                <TableRow key={`sk-${rowKey}`}>
                  {[
                    'name',
                    'provider',
                    'model',
                    'status',
                    'latency',
                    'availability',
                    'enabled',
                    'actions',
                  ].map((columnKey) => (
                    <TableCell key={`sk-${rowKey}-${columnKey}`}>
                      <Skeleton className='h-5 w-full' />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!loading && filtered.length === 0 && (
              <TableRow className='hover:bg-transparent'>
                <TableCell colSpan={columnCount} className='py-0'>
                  <div className='text-muted-foreground flex flex-col items-center justify-center gap-3 py-14 text-center'>
                    <div className='bg-muted flex size-12 items-center justify-center rounded-full'>
                      <Activity className='size-6 opacity-60' />
                    </div>
                    <div>
                      <p className='text-foreground font-medium'>
                        {monitors.length === 0
                          ? t('No monitors yet')
                          : t('No monitors match your filters')}
                      </p>
                      <p className='text-sm'>
                        {monitors.length === 0
                          ? t('Create a monitor to start tracking a channel.')
                          : t('Try adjusting your search or filters.')}
                      </p>
                    </div>
                    {monitors.length === 0 && (
                      <Button onClick={openCreate} size='sm'>
                        <Plus className='size-4' />
                        {t('Create Monitor')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              filtered.length > 0 &&
              filtered.map((monitor) => {
                const decryptFailed = Boolean(
                  (monitor as { api_key_decrypt_failed?: boolean })
                    .api_key_decrypt_failed
                )
                return (
                  <TableRow key={monitor.id}>
                    <TableCell className='font-medium'>
                      <div className='flex items-center gap-1.5'>
                        <span>{monitor.name}</span>
                        {decryptFailed && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Badge
                                  variant='destructive'
                                  className='gap-1 px-1.5'
                                />
                              }
                            >
                              <AlertTriangle className='size-3' />
                              {t('Key error')}
                            </TooltipTrigger>
                            <TooltipContent>
                              {t(
                                'The stored API key could not be decrypted. Re-enter it to fix.'
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          PROVIDER_BADGE[monitor.provider] ??
                            'bg-muted text-muted-foreground'
                        )}
                      >
                        {monitor.provider
                          ? t(
                              PROVIDER_LABEL[monitor.provider] ??
                                monitor.provider
                            )
                          : '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className='font-mono text-xs'>
                      {monitor.primary_model || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={monitor.last_status}
                        latencyMs={monitor.last_latency_ms}
                        apiMode={monitor.api_mode}
                      />
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {monitor.last_latency_ms != null
                        ? `${monitor.last_latency_ms} ms`
                        : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatAvailability(monitor.availability_rate_7d)}
                    </TableCell>
                    <TableCell className='text-center'>
                      <Switch
                        checked={monitor.enabled}
                        disabled={togglingId === monitor.id}
                        onCheckedChange={() => handleToggleEnabled(monitor)}
                        aria-label={t('Toggle enabled')}
                      />
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center justify-end gap-1'>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                disabled={runningId === monitor.id}
                                onClick={() => handleRun(monitor)}
                                aria-label={t('Run now')}
                              />
                            }
                          >
                            {runningId === monitor.id ? (
                              <Loader2 className='size-4 animate-spin' />
                            ) : (
                              <Play className='size-4' />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>{t('Run now')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                onClick={() => setHistoryTarget(monitor)}
                                aria-label={t('History')}
                              />
                            }
                          >
                            <History className='size-4' />
                          </TooltipTrigger>
                          <TooltipContent>{t('History')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                onClick={() => openEdit(monitor)}
                                aria-label={t('Edit')}
                              />
                            }
                          >
                            <Pencil className='size-4' />
                          </TooltipTrigger>
                          <TooltipContent>{t('Edit')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                className='text-muted-foreground hover:text-destructive'
                                onClick={() => setDeleteTarget(monitor)}
                                aria-label={t('Delete')}
                              />
                            }
                          >
                            <Trash2 className='size-4' />
                          </TooltipTrigger>
                          <TooltipContent>{t('Delete')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </Card>

      {/* Create / Edit dialog */}
      <MonitorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        monitor={editing}
        onSaved={() => loadMonitors({ silent: true })}
      />

      {/* Run result dialog */}
      <RunResultDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        monitorName={runMonitorName}
        apiMode={runApiMode}
        result={runResult}
      />

      {/* Template manager dialog */}
      <TemplateManagerDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
      />

      {/* History dialog */}
      <MonitorHistoryDialog
        open={!!historyTarget}
        onOpenChange={(o) => {
          if (!o) {
            setHistoryTarget(null)
          }
        }}
        monitor={historyTarget}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !deleting) {
            setDeleteTarget(null)
          }
        }}
        title={t('Delete Monitor')}
        description={t(
          'This will permanently remove "{{name}}" and its check history. This action cannot be undone.',
          { name: deleteTarget?.name ?? '' }
        )}
        contentClassName='sm:max-w-md'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              {t('Cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className='size-4 animate-spin' />}
              {t('Delete')}
            </Button>
          </>
        }
      >
        <p className='text-muted-foreground text-sm'>
          {t('Are you sure you want to delete this monitor?')}
        </p>
      </Dialog>
    </div>
  )
}
