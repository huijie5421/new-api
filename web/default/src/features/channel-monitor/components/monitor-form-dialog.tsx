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
import { useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  Globe,
  Wand2,
  X,
  KeyRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog } from '@/components/dialog'
import { channelMonitorAPI } from '../api'
import type { APIMode, BodyMode, ChannelMonitor, Provider } from '../types'
import { MonitorKeyPickerDialog } from './monitor-key-picker-dialog'

interface MonitorFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  monitor?: ChannelMonitor | null
  onSaved?: () => void
}

interface HeaderRow {
  key: string
  value: string
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
]

const API_MODES: { value: APIMode; label: string }[] = [
  { value: 'chat_completions', label: 'Chat Completions' },
  { value: 'responses', label: 'Responses' },
]

const DEFAULT_INTERVAL = 60
const MIN_INTERVAL = 15
const MAX_INTERVAL = 3600

const DEFAULT_TIMEOUT = 10
const MIN_TIMEOUT = 1
const MAX_TIMEOUT = 60

// Parse a JSON object string into key/value rows. Returns [] on invalid input.
function parseHeaderRows(headers: string): HeaderRow[] {
  if (!headers || !headers.trim()) return []
  try {
    const obj = JSON.parse(headers) as Record<string, unknown>
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }))
    }
  } catch {
    // fall through to empty
  }
  return []
}

// Parse the extra_models JSON-encoded string[] into a string array.
function parseExtraModels(extra: string): string[] {
  if (!extra || !extra.trim()) return []
  try {
    const arr = JSON.parse(extra)
    if (Array.isArray(arr)) return arr.map((m) => String(m)).filter(Boolean)
  } catch {
    // tolerate comma-separated fallback
    return extra
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export function MonitorFormDialog({
  open,
  onOpenChange,
  monitor,
  onSaved,
}: MonitorFormDialogProps) {
  const { t } = useTranslation()
  const isEdit = !!monitor?.id

  const [name, setName] = useState('')
  const [provider, setProvider] = useState<Provider>('openai')
  const [apiMode, setApiMode] = useState<APIMode>('chat_completions')
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [primaryModel, setPrimaryModel] = useState('')
  const [extraModels, setExtraModels] = useState<string[]>([])
  const [extraModelInput, setExtraModelInput] = useState('')
  const [groupName, setGroupName] = useState('')
  const [intervalSeconds, setIntervalSeconds] = useState(DEFAULT_INTERVAL)
  const [timeoutSeconds, setTimeoutSeconds] = useState(DEFAULT_TIMEOUT)
  const [enabled, setEnabled] = useState(true)

  const [keyPickerOpen, setKeyPickerOpen] = useState(false)

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([])
  const [bodyMode, setBodyMode] = useState<BodyMode>('auto')
  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Hydrate form whenever the dialog is (re)opened.
  useEffect(() => {
    if (!open) return
    if (monitor) {
      setName(monitor.name ?? '')
      setProvider((monitor.provider as Provider) || 'openai')
      setApiMode((monitor.api_mode as APIMode) || 'chat_completions')
      setEndpoint(monitor.endpoint ?? '')
      setApiKey('') // never prefill secret; empty = unchanged on edit
      setPrimaryModel(monitor.primary_model ?? '')
      setExtraModels(parseExtraModels(monitor.extra_models))
      setGroupName(monitor.group ?? '')
      setIntervalSeconds(monitor.interval_seconds || DEFAULT_INTERVAL)
      setTimeoutSeconds(monitor.timeout_seconds || DEFAULT_TIMEOUT)
      setEnabled(monitor.enabled ?? true)
      setHeaderRows(parseHeaderRows(monitor.headers))
      setBodyMode((monitor.body_mode as BodyMode) || 'auto')
      setBody(monitor.body ?? '')
      setAdvancedOpen(
        Boolean(
          (monitor.headers && monitor.headers !== '{}' && monitor.headers) ||
            (monitor.body && monitor.body !== '{}' && monitor.body) ||
            (monitor.body_mode && monitor.body_mode !== 'auto')
        )
      )
    } else {
      setName('')
      setProvider('openai')
      setApiMode('chat_completions')
      setEndpoint('')
      setApiKey('')
      setPrimaryModel('')
      setExtraModels([])
      setGroupName('')
      setIntervalSeconds(DEFAULT_INTERVAL)
      setTimeoutSeconds(DEFAULT_TIMEOUT)
      setEnabled(true)
      setHeaderRows([])
      setBodyMode('auto')
      setBody('')
      setAdvancedOpen(false)
    }
    setExtraModelInput('')
    setBodyError(null)
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, monitor])

  const showApiMode = provider === 'openai'

  const commitExtraModelInput = () => {
    const parts = extraModelInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    setExtraModels((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (!next.includes(p)) next.push(p)
      }
      return next
    })
    setExtraModelInput('')
  }

  const removeExtraModel = (model: string) => {
    setExtraModels((prev) => prev.filter((m) => m !== model))
  }

  const updateHeaderRow = (index: number, patch: Partial<HeaderRow>) => {
    setHeaderRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  const addHeaderRow = () =>
    setHeaderRows((prev) => [...prev, { key: '', value: '' }])

  const removeHeaderRow = (index: number) =>
    setHeaderRows((prev) => prev.filter((_, i) => i !== index))

  const validateBodyJson = (raw: string): boolean => {
    if (!raw.trim()) {
      setBodyError(null)
      return true
    }
    try {
      JSON.parse(raw)
      setBodyError(null)
      return true
    } catch (err) {
      setBodyError(
        err instanceof Error ? err.message : t('Invalid JSON')
      )
      return false
    }
  }

  const formatBody = () => {
    if (!body.trim()) return
    try {
      setBody(JSON.stringify(JSON.parse(body), null, 2))
      setBodyError(null)
    } catch (err) {
      setBodyError(err instanceof Error ? err.message : t('Invalid JSON'))
      toast.error(t('Body is not valid JSON.'))
    }
  }

  const buildHeadersJson = (): string => {
    const rows = headerRows.filter((r) => r.key.trim())
    if (rows.length === 0) return ''
    const obj: Record<string, string> = {}
    for (const r of rows) obj[r.key.trim()] = r.value
    return JSON.stringify(obj)
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = t('Name is required')
    if (!provider) next.provider = t('Provider is required')
    if (!endpoint.trim()) next.endpoint = t('Endpoint is required')
    if (!primaryModel.trim()) next.primaryModel = t('Primary model is required')
    if (
      !Number.isFinite(intervalSeconds) ||
      intervalSeconds < MIN_INTERVAL ||
      intervalSeconds > MAX_INTERVAL
    ) {
      next.interval = t('Interval must be between {{min}} and {{max}} seconds', {
        min: MIN_INTERVAL,
        max: MAX_INTERVAL,
      })
    }
    if (
      !Number.isFinite(timeoutSeconds) ||
      timeoutSeconds < MIN_TIMEOUT ||
      timeoutSeconds > MAX_TIMEOUT
    ) {
      next.timeout = t('Timeout must be between {{min}} and {{max}} seconds', {
        min: MIN_TIMEOUT,
        max: MAX_TIMEOUT,
      })
    } else if (
      Number.isFinite(intervalSeconds) &&
      timeoutSeconds >= intervalSeconds
    ) {
      next.timeout = t('Timeout must be less than the interval')
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    // commit any pending tag text first
    if (extraModelInput.trim()) commitExtraModelInput()
    if (!validate()) {
      toast.error(t('Please fix the highlighted fields.'))
      return
    }
    if (body.trim() && !validateBodyJson(body)) {
      setAdvancedOpen(true)
      toast.error(t('Body is not valid JSON.'))
      return
    }

    const pendingExtra = extraModelInput.trim()
      ? Array.from(
          new Set([
            ...extraModels,
            ...extraModelInput
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          ])
        )
      : extraModels

    const payload: Partial<ChannelMonitor> = {
      name: name.trim(),
      provider,
      api_mode: showApiMode ? apiMode : '',
      endpoint: endpoint.trim(),
      primary_model: primaryModel.trim(),
      extra_models: JSON.stringify(pendingExtra),
      group: groupName.trim(),
      interval_seconds: intervalSeconds,
      timeout_seconds: timeoutSeconds,
      enabled,
      headers: buildHeadersJson(),
      body_mode: bodyMode,
      body: body.trim(),
    }

    // api_key: only send when provided (empty on edit = unchanged).
    if (apiKey.trim() || !isEdit) {
      payload.api_key = apiKey
    }

    setSubmitting(true)
    try {
      if (isEdit && monitor) {
        await channelMonitorAPI.update(monitor.id, payload)
        toast.success(t('Monitor updated'))
      } else {
        await channelMonitorAPI.create(payload)
        toast.success(t('Monitor created'))
      }
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      // Global handler surfaces server message; add a fallback.
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t('Failed to save monitor')
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const intervalHint = useMemo(
    () =>
      t('How often the monitor runs, in seconds ({{min}}–{{max}}).', {
        min: MIN_INTERVAL,
        max: MAX_INTERVAL,
      }),
    [t]
  )

  const timeoutHint = useMemo(
    () => t('Request timeout in seconds (1-60, must be less than interval)'),
    [t]
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o)
      }}
      title={isEdit ? t('Edit Monitor') : t('Create Monitor')}
      description={t(
        'Configure an upstream channel health check for a provider model.'
      )}
      contentClassName='sm:max-w-2xl'
      bodyClassName='space-y-5'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className='size-4 animate-spin' />}
            {isEdit ? t('Save Changes') : t('Create')}
          </Button>
        </>
      }
    >
      <div className='space-y-5'>
        {/* Name */}
        <div className='space-y-1.5'>
          <Label htmlFor='monitor-name'>
            {t('Name')} <span className='text-destructive'>*</span>
          </Label>
          <Input
            id='monitor-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('e.g., OpenAI GPT-4o Probe')}
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className='text-destructive text-xs'>{errors.name}</p>
          )}
        </div>

        {/* Provider + API mode */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label>
              {t('Provider')} <span className='text-destructive'>*</span>
            </Label>
            <div className='bg-muted/60 inline-flex w-full rounded-lg p-0.5'>
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type='button'
                  onClick={() => setProvider(p.value)}
                  className={cn(
                    'flex-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    provider === p.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {showApiMode && (
            <div className='space-y-1.5'>
              <Label>{t('API Mode')}</Label>
              <Select
                items={API_MODES.map((m) => ({
                  value: m.value,
                  label: m.label,
                }))}
                value={apiMode}
                onValueChange={(v) => setApiMode(v as APIMode)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={t('Select API mode')} />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {API_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Endpoint */}
        <div className='space-y-1.5'>
          <Label htmlFor='monitor-endpoint'>
            {t('Endpoint')} <span className='text-destructive'>*</span>
          </Label>
          <div className='flex gap-2'>
            <Input
              id='monitor-endpoint'
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder='https://api.openai.com'
              className='font-mono'
              aria-invalid={!!errors.endpoint}
            />
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='shrink-0'
              onClick={() => setEndpoint(window.location.origin)}
              aria-label={t('Use current domain')}
              title={t('Use current domain')}
            >
              <Globe className='size-4' />
            </Button>
          </div>
          {errors.endpoint && (
            <p className='text-destructive text-xs'>{errors.endpoint}</p>
          )}
        </div>

        {/* API key */}
        <div className='space-y-1.5'>
          <Label htmlFor='monitor-apikey'>{t('API Key')}</Label>
          <div className='flex gap-2'>
            <Input
              id='monitor-apikey'
              type='password'
              autoComplete='new-password'
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit ? '••••••••••••' : 'sk-...'}
              className='font-mono'
            />
            <Button
              type='button'
              variant='outline'
              className='shrink-0'
              onClick={() => setKeyPickerOpen(true)}
            >
              <KeyRound className='size-4' />
              {t('Select my key')}
            </Button>
          </div>
          <p className='text-muted-foreground text-xs'>
            {isEdit
              ? t('Leave blank to keep the existing key unchanged.')
              : t('The upstream credential used for health checks.')}
          </p>
        </div>

        {/* Primary model */}
        <div className='space-y-1.5'>
          <Label htmlFor='monitor-primary'>
            {t('Primary Model')} <span className='text-destructive'>*</span>
          </Label>
          <Input
            id='monitor-primary'
            value={primaryModel}
            onChange={(e) => setPrimaryModel(e.target.value)}
            placeholder='gpt-4o'
            className='font-mono'
            aria-invalid={!!errors.primaryModel}
          />
          {errors.primaryModel && (
            <p className='text-destructive text-xs'>{errors.primaryModel}</p>
          )}
        </div>

        {/* Extra models (tag input) */}
        <div className='space-y-1.5'>
          <Label htmlFor='monitor-extra'>{t('Extra Models')}</Label>
          <div className='border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1 transition-colors focus-within:ring-3'>
            {extraModels.map((m) => (
              <Badge key={m} variant='secondary' className='gap-1 pr-1'>
                <span className='font-mono'>{m}</span>
                <button
                  type='button'
                  onClick={() => removeExtraModel(m)}
                  className='hover:bg-background/60 rounded-full p-0.5'
                  aria-label={t('Remove {{model}}', { model: m })}
                >
                  <X className='size-3' />
                </button>
              </Badge>
            ))}
            <input
              id='monitor-extra'
              value={extraModelInput}
              onChange={(e) => setExtraModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  commitExtraModelInput()
                } else if (
                  e.key === 'Backspace' &&
                  !extraModelInput &&
                  extraModels.length
                ) {
                  removeExtraModel(extraModels[extraModels.length - 1])
                }
              }}
              onBlur={commitExtraModelInput}
              placeholder={
                extraModels.length ? '' : t('Type a model, press Enter')
              }
              className='placeholder:text-muted-foreground h-6 min-w-24 flex-1 bg-transparent font-mono text-sm outline-none'
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            {t('Additional models checked alongside the primary model.')}
          </p>
        </div>

        {/* Group + interval + timeout */}
        <div className='grid gap-4 sm:grid-cols-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='monitor-group'>{t('Group')}</Label>
            <Input
              id='monitor-group'
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t('Optional')}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='monitor-interval'>
              {t('Interval (seconds)')}{' '}
              <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='monitor-interval'
              type='number'
              min={MIN_INTERVAL}
              max={MAX_INTERVAL}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              aria-invalid={!!errors.interval}
            />
            {errors.interval ? (
              <p className='text-destructive text-xs'>{errors.interval}</p>
            ) : (
              <p className='text-muted-foreground text-xs'>{intervalHint}</p>
            )}
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='monitor-timeout'>
              {t('Timeout (seconds)')}{' '}
              <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='monitor-timeout'
              type='number'
              min={MIN_TIMEOUT}
              max={MAX_TIMEOUT}
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              aria-invalid={!!errors.timeout}
            />
            {errors.timeout ? (
              <p className='text-destructive text-xs'>{errors.timeout}</p>
            ) : (
              <p className='text-muted-foreground text-xs'>{timeoutHint}</p>
            )}
          </div>
        </div>

        {/* Enabled */}
        <div className='bg-muted/40 border-border flex items-center justify-between rounded-lg border px-3 py-2.5'>
          <div>
            <Label htmlFor='monitor-enabled' className='cursor-pointer'>
              {t('Enabled')}
            </Label>
            <p className='text-muted-foreground text-xs'>
              {t('Run this monitor on its schedule.')}
            </p>
          </div>
          <Switch
            id='monitor-enabled'
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Advanced */}
        <div className='border-border rounded-lg border'>
          <button
            type='button'
            onClick={() => setAdvancedOpen((o) => !o)}
            className='hover:bg-muted/50 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'
            aria-expanded={advancedOpen}
          >
            <span>{t('Advanced')}</span>
            <ChevronDown
              className={cn(
                'text-muted-foreground size-4 transition-transform',
                advancedOpen && 'rotate-180'
              )}
            />
          </button>

          {advancedOpen && (
            <div className='border-border space-y-5 border-t p-3'>
              {/* Custom headers */}
              <div className='space-y-2'>
                <Label>{t('Custom Headers')}</Label>
                <div className='space-y-2'>
                  {headerRows.length === 0 && (
                    <p className='text-muted-foreground text-xs'>
                      {t('No custom headers.')}
                    </p>
                  )}
                  {headerRows.map((row, i) => (
                    <div key={i} className='flex items-center gap-2'>
                      <Input
                        value={row.key}
                        onChange={(e) =>
                          updateHeaderRow(i, { key: e.target.value })
                        }
                        placeholder={t('Header')}
                        className='font-mono'
                      />
                      <Input
                        value={row.value}
                        onChange={(e) =>
                          updateHeaderRow(i, { value: e.target.value })
                        }
                        placeholder={t('Value')}
                        className='font-mono'
                      />
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='text-muted-foreground hover:text-destructive shrink-0'
                        onClick={() => removeHeaderRow(i)}
                        aria-label={t('Remove header')}
                      >
                        <Trash2 className='size-4' />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={addHeaderRow}
                >
                  <Plus className='size-3.5' />
                  {t('Add Header')}
                </Button>
              </div>

              {/* Body mode */}
              <div className='space-y-1.5'>
                <Label>{t('Body Mode')}</Label>
                <Select
                  items={[
                    { value: 'auto', label: t('Auto') },
                    { value: 'minimal', label: t('Minimal') },
                    { value: 'custom', label: t('Custom') },
                  ]}
                  value={bodyMode}
                  onValueChange={(v) => setBodyMode(v as BodyMode)}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder={t('Select body mode')} />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='auto'>{t('Auto')}</SelectItem>
                      <SelectItem value='minimal'>{t('Minimal')}</SelectItem>
                      <SelectItem value='custom'>{t('Custom')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Auto builds the request body; Minimal sends a tiny probe; Custom uses the JSON below.'
                  )}
                </p>
              </div>

              {/* Body JSON */}
              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <Label htmlFor='monitor-body'>{t('Request Body (JSON)')}</Label>
                  <Button
                    type='button'
                    variant='ghost'
                    size='xs'
                    onClick={formatBody}
                    disabled={!body.trim()}
                  >
                    <Wand2 className='size-3' />
                    {t('Format')}
                  </Button>
                </div>
                <Textarea
                  id='monitor-body'
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onBlur={() => validateBodyJson(body)}
                  placeholder='{ "max_tokens": 1 }'
                  rows={6}
                  className='font-mono text-xs'
                  aria-invalid={!!bodyError}
                />
                {bodyError && (
                  <p className='text-destructive text-xs'>{bodyError}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <MonitorKeyPickerDialog
        open={keyPickerOpen}
        onOpenChange={setKeyPickerOpen}
        onPick={(value) => setApiKey(value)}
      />
    </Dialog>
  )
}
