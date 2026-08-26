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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { channelMonitorAPI } from '../api'
import type { ChannelMonitor, ChannelMonitorTemplate } from '../types'

interface TemplateApplyPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: ChannelMonitorTemplate | null
  onApplied?: () => void
}

const API_MODE_LABEL: Record<string, string> = {
  chat_completions: 'Chat Completions',
  responses: 'Responses',
  image_generation: 'Image Generations',
}

export function TemplateApplyPickerDialog({
  open,
  onOpenChange,
  template,
  onApplied,
}: TemplateApplyPickerDialogProps) {
  const { t } = useTranslation()

  const [monitors, setMonitors] = useState<ChannelMonitor[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)

  // Load monitors of the same provider whenever the dialog opens, then default
  // every match to selected (parity with the legacy "apply to all" behavior).
  useEffect(() => {
    if (!open || !template) {
      return
    }
    let cancelled = false
    setLoading(true)
    setSelected(new Set())
    void channelMonitorAPI
      .getAll()
      .then((data) => {
        if (cancelled) {
          return
        }
        const matches = data.filter((m) => m.provider === template.provider)
        setMonitors(matches)
        setSelected(new Set(matches.map((m) => m.id)))
      })
      .catch((err) => {
        if (cancelled) {
          return
        }
        const message =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || t('Failed to load monitors')
        toast.error(message)
        setMonitors([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, template, t])

  const allSelected = useMemo(
    () => monitors.length > 0 && selected.size === monitors.length,
    [monitors, selected]
  )

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === monitors.length
        ? new Set()
        : new Set(monitors.map((m) => m.id))
    )
  }

  const handleApply = async () => {
    if (!template) {
      return
    }
    if (selected.size === 0) {
      toast.error(t('Select at least one monitor.'))
      return
    }
    setApplying(true)
    try {
      await channelMonitorAPI.applyTemplate({
        template_id: template.id,
        monitor_ids: [...selected],
      })
      toast.success(
        t('Template applied to {{count}} monitor(s)', { count: selected.size })
      )
      onApplied?.()
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t('Failed to apply template')
      toast.error(message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!applying) {
          onOpenChange(o)
        }
      }}
      title={t('Apply Template')}
      description={
        template
          ? t(
              'Overwrite the request configuration of the selected {{provider}} monitors with "{{name}}".',
              { provider: template.provider, name: template.name }
            )
          : t('Apply this template to monitors.')
      }
      contentClassName='sm:max-w-lg'
      bodyClassName='space-y-3'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || selected.size === 0}
          >
            {applying && <Loader2 className='size-4 animate-spin' />}
            {t('Apply to {{count}} monitor(s)', { count: selected.size })}
          </Button>
        </>
      }
    >
      <div className='space-y-3'>
        {monitors.length > 0 && (
          <div className='flex items-center justify-between'>
            <button
              type='button'
              onClick={toggleAll}
              className='text-muted-foreground hover:text-foreground text-xs font-medium transition-colors'
            >
              {allSelected ? t('Clear all') : t('Select all')}
            </button>
            <span className='text-muted-foreground text-xs'>
              {t('{{count}} selected', { count: selected.size })}
            </span>
          </div>
        )}

        <div className='border-border max-h-80 space-y-1 overflow-y-auto rounded-lg border p-1'>
          {loading && (
            <div className='text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm'>
              <Loader2 className='size-4 animate-spin' />
              {t('Loading...')}
            </div>
          )}
          {!loading && monitors.length === 0 && (
            <div className='text-muted-foreground py-8 text-center text-sm'>
              {t('No {{provider}} monitors found.', {
                provider: template?.provider ?? '',
              })}
            </div>
          )}
          {!loading &&
            monitors.length > 0 &&
            monitors.map((m) => {
              const checked = selected.has(m.id)
              const inputId = `apply-monitor-${m.id}`
              return (
                <Label
                  key={m.id}
                  htmlFor={inputId}
                  className={cn(
                    'hover:bg-muted/60 flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors',
                    checked && 'bg-muted/40'
                  )}
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={() => toggle(m.id)}
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <span className='truncate text-sm font-medium'>
                        {m.name}
                      </span>
                      {m.api_mode ? (
                        <Badge variant='outline' className='shrink-0'>
                          {t(API_MODE_LABEL[m.api_mode] ?? m.api_mode)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className='text-muted-foreground truncate font-mono text-xs'>
                      {m.primary_model || '—'}
                    </div>
                  </div>
                </Label>
              )
            })}
        </div>
      </div>
    </Dialog>
  )
}
