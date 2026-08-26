import { Loader2, ChevronDown, Globe, X, KeyRound } from 'lucide-react'
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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
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
import { cn } from '@/lib/utils'

import { channelMonitorAPI } from '../api'
import {
  buildHeadersJson,
  parseHeaderRows,
  type HeaderRow,
} from '../lib/advanced-request-config'
import {
  timingDefaultsForApiMode,
  timingForApiModeChange,
} from '../lib/monitor-timing'
import type { APIMode, BodyMode, ChannelMonitor, Provider } from '../types'
import { AdvancedRequestConfig } from './advanced-request-config'
import { MonitorKeyPickerDialog } from './monitor-key-picker-dialog'

interface MonitorFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  monitor?: ChannelMonitor | null
  onSaved?: () => void
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'grok', label: 'Grok' },
]

const API_MODES: { value: APIMode; label: string }[] = [
  { value: 'chat_completions', label: 'Chat Completions' },
  { value: 'responses', label: 'Responses' },
  { value: 'image_generation', label: 'Image Generations' },
]

const MIN_INTERVAL = 60
const MAX_INTERVAL = 3600

const MIN_TIMEOUT = 1

// Parse the extra_models JSON-encoded string[] into a string array.
function parseExtraModels(extra: string): string[] {
  if (!extra || !extra.trim()) {
    return []
  }
  try {
    const arr = JSON.parse(extra)
    if (Array.isArray(arr)) {
      return arr.map((m) => String(m)).filter(Boolean)
    }
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
  const [intervalSeconds, setIntervalSeconds] = useState(
    timingDefaultsForApiMode('chat_completions').intervalSeconds
  )
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    timingDefaultsForApiMode('chat_completions').timeoutSeconds
  )
  const [enabled, setEnabled] = useState(true)
  const [ccSpoofEnabled, setCcSpoofEnabled] = useState(false)

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
    if (!open) {
      return
    }
    if (monitor) {
      setName(monitor.name ?? '')
      setProvider((monitor.provider as Provider) || 'openai')
      setApiMode((monitor.api_mode as APIMode) || 'chat_completions')
      setEndpoint(monitor.endpoint ?? '')
      setApiKey('') // never prefill secret; empty = unchanged on edit
      setPrimaryModel(monitor.primary_model ?? '')
      setExtraModels(parseExtraModels(monitor.extra_models))
      setGroupName(monitor.group ?? '')
      const monitorTiming = timingDefaultsForApiMode(monitor.api_mode)
      setIntervalSeconds(
        monitor.interval_seconds || monitorTiming.intervalSeconds
      )
      setTimeoutSeconds(monitor.timeout_seconds || monitorTiming.timeoutSeconds)
      setEnabled(monitor.enabled ?? true)
      setCcSpoofEnabled(monitor.cc_spoof_enabled ?? false)
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
      setIntervalSeconds(
        timingDefaultsForApiMode('chat_completions').intervalSeconds
      )
      setTimeoutSeconds(
        timingDefaultsForApiMode('chat_completions').timeoutSeconds
      )
      setEnabled(true)
      setCcSpoofEnabled(false)
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

  const showApiMode = provider === 'openai' || provider === 'grok'
  const maxTimeoutSeconds = timingDefaultsForApiMode(apiMode).maxTimeoutSeconds

  const handleApiModeChange = (nextApiMode: APIMode) => {
    const timing = timingForApiModeChange(
      apiMode,
      nextApiMode,
      intervalSeconds,
      timeoutSeconds
    )
    setApiMode(nextApiMode)
    setIntervalSeconds(timing.intervalSeconds)
    setTimeoutSeconds(timing.timeoutSeconds)
  }

  const handleProviderChange = (nextProvider: Provider) => {
    setProvider(nextProvider)
    if (
      nextProvider !== 'openai' &&
      nextProvider !== 'grok' &&
      apiMode === 'image_generation'
    ) {
      handleApiModeChange('chat_completions')
    }
  }

  const commitExtraModelInput = () => {
    const parts = extraModelInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) {
      return
    }
    setExtraModels((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (!next.includes(p)) {
          next.push(p)
        }
      }
      return next
    })
    setExtraModelInput('')
  }

  const removeExtraModel = (model: string) => {
    setExtraModels((prev) => prev.filter((m) => m !== model))
  }

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
      setBodyError(err instanceof Error ? err.message : t('Invalid JSON'))
      return false
    }
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!name.trim()) {
      next.name = t('Name is required')
    }
    if (!provider) {
      next.provider = t('Provider is required')
    }
    if (!endpoint.trim()) {
      next.endpoint = t('Endpoint is required')
    }
    if (!primaryModel.trim()) {
      next.primaryModel = t('Primary model is required')
    }
    if (
      !Number.isFinite(intervalSeconds) ||
      intervalSeconds < MIN_INTERVAL ||
      intervalSeconds > MAX_INTERVAL
    ) {
      next.interval = t(
        'Interval must be between {{min}} and {{max}} seconds',
        {
          min: MIN_INTERVAL,
          max: MAX_INTERVAL,
        }
      )
    }
    if (
      !Number.isFinite(timeoutSeconds) ||
      timeoutSeconds < MIN_TIMEOUT ||
      timeoutSeconds > maxTimeoutSeconds
    ) {
      next.timeout = t('Timeout must be between {{min}} and {{max}} seconds', {
        min: MIN_TIMEOUT,
        max: maxTimeoutSeconds,
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
    if (extraModelInput.trim()) {
      commitExtraModelInput()
    }
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
      headers: buildHeadersJson(headerRows),
      body_mode: bodyMode,
      body: body.trim(),
      cc_spoof_enabled: provider === 'anthropic' ? ccSpoofEnabled : false,
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
    () =>
      apiMode === 'image_generation'
        ? t('Image timeout must be between 1 and 180 seconds')
        : t('Request timeout in seconds (1-60, must be less than interval)'),
    [apiMode, t]
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) {
          onOpenChange(o)
        }
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
                  onClick={() => handleProviderChange(p.value)}
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
                  label: t(m.label),
                }))}
                value={apiMode}
                onValueChange={(v) => handleApiModeChange(v as APIMode)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={t('Select API mode')} />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {API_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {t(m.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {apiMode === 'image_generation' && (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Image health-check success under 60 seconds is green; 60 seconds or slower is yellow; failures are red.'
                  )}
                </p>
              )}
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
              max={maxTimeoutSeconds}
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

        {/* Claude Code spoof (anthropic only) */}
        {provider === 'anthropic' && (
          <div className='bg-muted/40 border-border flex items-center justify-between rounded-lg border px-3 py-2.5'>
            <div>
              <Label htmlFor='monitor-cc-spoof' className='cursor-pointer'>
                {t('Claude Code spoof')}
              </Label>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Inject the global Claude Code identity (User-Agent, anthropic-beta, system prompt, metadata.user_id) so upstreams that require the official CLI accept the probe.'
                )}
              </p>
            </div>
            <Switch
              id='monitor-cc-spoof'
              checked={ccSpoofEnabled}
              onCheckedChange={setCcSpoofEnabled}
            />
          </div>
        )}

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
            <div className='border-border border-t p-3'>
              <AdvancedRequestConfig
                headerRows={headerRows}
                bodyMode={bodyMode}
                body={body}
                bodyError={bodyError}
                onHeaderRowsChange={setHeaderRows}
                onBodyModeChange={setBodyMode}
                onBodyChange={setBody}
                onBodyErrorChange={setBodyError}
                idPrefix='monitor'
              />
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
