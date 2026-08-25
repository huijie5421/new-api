import { Loader2 } from 'lucide-react'
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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { channelMonitorAPI } from '../api'
import {
  buildHeadersJson,
  parseHeaderRows,
  type HeaderRow,
} from '../lib/advanced-request-config'
import type {
  APIMode,
  BodyMode,
  ChannelMonitorTemplate,
  Provider,
} from '../types'
import { AdvancedRequestConfig } from './advanced-request-config'

interface TemplateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: ChannelMonitorTemplate | null
  /** Provider preselected when creating a new template (defaults to openai). */
  defaultProvider?: Provider
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
]

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  defaultProvider = 'openai',
  onSaved,
}: TemplateFormDialogProps) {
  const { t } = useTranslation()
  const isEdit = !!template?.id

  const [name, setName] = useState('')
  const [provider, setProvider] = useState<Provider>(defaultProvider)
  const [apiMode, setApiMode] = useState<APIMode>('chat_completions')
  const [description, setDescription] = useState('')

  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([])
  const [bodyMode, setBodyMode] = useState<BodyMode>('auto')
  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Hydrate the form whenever the dialog is (re)opened.
  useEffect(() => {
    if (!open) {
      return
    }
    if (template) {
      setName(template.name ?? '')
      setProvider((template.provider as Provider) || 'openai')
      setApiMode((template.api_mode as APIMode) || 'chat_completions')
      setDescription(template.description ?? '')
      setHeaderRows(parseHeaderRows(template.headers))
      setBodyMode((template.body_mode as BodyMode) || 'auto')
      setBody(template.body ?? '')
    } else {
      setName('')
      setProvider(defaultProvider)
      setApiMode('chat_completions')
      setDescription('')
      setHeaderRows([])
      setBodyMode('auto')
      setBody('')
    }
    setBodyError(null)
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template])

  const showApiMode = provider === 'openai' || provider === 'grok'

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
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error(t('Please fix the highlighted fields.'))
      return
    }
    if (body.trim() && !validateBodyJson(body)) {
      toast.error(t('Body is not valid JSON.'))
      return
    }

    const payload: Partial<ChannelMonitorTemplate> = {
      name: name.trim(),
      provider,
      api_mode: showApiMode ? apiMode : '',
      description: description.trim(),
      headers: buildHeadersJson(headerRows),
      body_mode: bodyMode,
      body: body.trim(),
    }

    setSubmitting(true)
    try {
      if (isEdit && template) {
        await channelMonitorAPI.updateTemplate(template.id, payload)
        toast.success(t('Template updated'))
      } else {
        await channelMonitorAPI.createTemplate(payload)
        toast.success(t('Template created'))
      }
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t('Failed to save template')
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) {
          onOpenChange(o)
        }
      }}
      title={isEdit ? t('Edit Template') : t('New Template')}
      description={t(
        'Reusable request configuration that can be applied to monitors of the same provider.'
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
          <Label htmlFor='template-name'>
            {t('Name')} <span className='text-destructive'>*</span>
          </Label>
          <Input
            id='template-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('e.g., OpenAI Minimal Probe')}
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
                  disabled={isEdit}
                  onClick={() => setProvider(p.value)}
                  className={cn(
                    'flex-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    provider === p.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                    isEdit && 'cursor-not-allowed opacity-70'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {isEdit && (
              <p className='text-muted-foreground text-xs'>
                {t('Provider cannot be changed after creation.')}
              </p>
            )}
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

        {/* Description */}
        <div className='space-y-1.5'>
          <Label htmlFor='template-description'>{t('Description')}</Label>
          <Textarea
            id='template-description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('Optional notes about this template.')}
            rows={2}
          />
        </div>

        {/* Advanced request config (headers + body) */}
        <div className='border-border rounded-lg border p-3'>
          <AdvancedRequestConfig
            headerRows={headerRows}
            bodyMode={bodyMode}
            body={body}
            bodyError={bodyError}
            onHeaderRowsChange={setHeaderRows}
            onBodyModeChange={setBodyMode}
            onBodyChange={setBody}
            onBodyErrorChange={setBodyError}
            idPrefix='template'
          />
        </div>
      </div>
    </Dialog>
  )
}
