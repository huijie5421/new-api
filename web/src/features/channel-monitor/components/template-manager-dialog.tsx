import {
  FileStack,
  Loader2,
  Pencil,
  Plus,
  Send,
  Star,
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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { channelMonitorAPI } from '../api'
import type { ChannelMonitorTemplate, Provider } from '../types'
import { TemplateApplyPickerDialog } from './template-apply-picker-dialog'
import { TemplateFormDialog } from './template-form-dialog'

interface TemplateManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'grok', label: 'Grok' },
]

const BODY_MODE_BADGE: Record<string, string> = {
  auto: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  minimal: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  custom: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
}

// Count the keys in a JSON object string; 0 on empty/invalid input.
function countHeaders(headers: string): number {
  if (!headers || !headers.trim()) {
    return 0
  }
  try {
    const obj = JSON.parse(headers) as Record<string, unknown>
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.keys(obj).length
    }
  } catch {
    // ignore malformed snapshot
  }
  return 0
}

function TemplateCard({
  template,
  monitorCount,
  onApply,
  onEdit,
  onDelete,
}: {
  template: ChannelMonitorTemplate
  monitorCount: number | undefined
  onApply: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const headerCount = countHeaders(template.headers)
  const isOpenAI =
    template.provider === 'openai' || template.provider === 'grok'

  return (
    <div className='border-border bg-card hover:border-border/80 space-y-3 rounded-xl border p-4 transition-colors'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 flex-1 space-y-1'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <span className='truncate text-sm font-semibold'>
              {template.name}
            </span>
            {template.is_default && (
              <Badge className='gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400'>
                <Star className='size-3' />
                {t('Default')}
              </Badge>
            )}
          </div>
          {template.description && (
            <p className='text-muted-foreground line-clamp-2 text-xs'>
              {template.description}
            </p>
          )}
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-1.5'>
        <Badge
          className={cn(
            BODY_MODE_BADGE[template.body_mode] ??
              'bg-muted text-muted-foreground'
          )}
        >
          {t('Body: {{mode}}', { mode: template.body_mode || 'auto' })}
        </Badge>
        {isOpenAI && template.api_mode && (
          <Badge variant='outline'>{template.api_mode}</Badge>
        )}
        <Badge variant='secondary'>
          {t('{{count}} header(s)', { count: headerCount })}
        </Badge>
        <Badge variant='outline' className='text-muted-foreground'>
          {monitorCount === undefined
            ? t('… monitors')
            : t('{{count}} monitor(s)', { count: monitorCount })}
        </Badge>
      </div>

      <div className='flex items-center justify-end gap-1.5'>
        <Button variant='outline' size='sm' onClick={onApply}>
          <Send className='size-3.5' />
          {t('Apply')}
        </Button>
        <Button variant='ghost' size='sm' onClick={onEdit}>
          <Pencil className='size-3.5' />
          {t('Edit')}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-destructive'
          onClick={onDelete}
        >
          <Trash2 className='size-3.5' />
          {t('Delete')}
        </Button>
      </div>
    </div>
  )
}

export function TemplateManagerDialog({
  open,
  onOpenChange,
}: TemplateManagerDialogProps) {
  const { t } = useTranslation()

  const [templates, setTemplates] = useState<ChannelMonitorTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [activeProvider, setActiveProvider] = useState<Provider>('openai')

  // Lazily-loaded associated-monitor counts, keyed by template id.
  const [monitorCounts, setMonitorCounts] = useState<Record<number, number>>({})

  // Nested dialog state.
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ChannelMonitorTemplate | null>(null)
  const [applyTarget, setApplyTarget] = useState<ChannelMonitorTemplate | null>(
    null
  )
  const [deleteTarget, setDeleteTarget] =
    useState<ChannelMonitorTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const data = await channelMonitorAPI.getAllTemplates()
      setTemplates(data)
    } catch {
      toast.error(t('Failed to load templates'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!open) {
      return
    }
    setMonitorCounts({})
    loadTemplates()
  }, [open, loadTemplates])

  // Lazily fetch associated-monitor counts for the visible templates.
  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    const visible = templates.filter((tpl) => tpl.provider === activeProvider)
    for (const tpl of visible) {
      if (monitorCounts[tpl.id] !== undefined) {
        continue
      }
      channelMonitorAPI
        .getTemplateMonitors(tpl.id)
        .then((data) => {
          if (cancelled) {
            return
          }
          setMonitorCounts((prev) => ({ ...prev, [tpl.id]: data.length }))
        })
        .catch(() => {
          if (cancelled) {
            return
          }
          setMonitorCounts((prev) => ({ ...prev, [tpl.id]: 0 }))
        })
    }
    return () => {
      cancelled = true
    }
  }, [open, templates, activeProvider, monitorCounts])

  const countFor = (provider: Provider) =>
    templates.filter((tpl) => tpl.provider === provider).length

  const visibleTemplates = templates.filter(
    (tpl) => tpl.provider === activeProvider
  )

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (tpl: ChannelMonitorTemplate) => {
    setEditing(tpl)
    setFormOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) {
      return
    }
    setDeleting(true)
    try {
      await channelMonitorAPI.deleteTemplate(deleteTarget.id)
      toast.success(t('Template deleted'))
      setDeleteTarget(null)
      loadTemplates()
    } catch {
      toast.error(t('Failed to delete template'))
    } finally {
      setDeleting(false)
    }
  }

  const handleSaved = () => {
    setMonitorCounts({})
    loadTemplates()
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          <span className='flex items-center gap-2'>
            <span className='flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm'>
              <FileStack className='size-4 text-white' />
            </span>
            {t('Request Templates')}
          </span>
        }
        description={t(
          'Manage reusable request configurations and apply them to monitors.'
        )}
        contentClassName='sm:max-w-3xl'
        bodyClassName='space-y-4'
      >
        <div className='space-y-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <Tabs
              value={activeProvider}
              onValueChange={(v) => setActiveProvider(v as Provider)}
            >
              <TabsList>
                {PROVIDERS.map((p) => (
                  <TabsTrigger key={p.value} value={p.value}>
                    {p.label}
                    <Badge variant='secondary' className='ml-1.5 tabular-nums'>
                      {countFor(p.value)}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Button size='sm' onClick={openCreate}>
              <Plus className='size-4' />
              {t('New Template')}
            </Button>
          </div>

          {loading && (
            <div className='text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm'>
              <Loader2 className='size-4 animate-spin' />
              {t('Loading...')}
            </div>
          )}
          {!loading && visibleTemplates.length === 0 && (
            <div className='border-border text-muted-foreground flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center text-sm'>
              <FileStack className='size-6 opacity-50' />
              <div>
                <p className='text-foreground font-medium'>
                  {t('No templates for this provider')}
                </p>
                <p>{t('Create a template to reuse request settings.')}</p>
              </div>
              <Button size='sm' onClick={openCreate}>
                <Plus className='size-4' />
                {t('New Template')}
              </Button>
            </div>
          )}
          {!loading && visibleTemplates.length > 0 && (
            <div className='grid gap-3 sm:grid-cols-2'>
              {visibleTemplates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  monitorCount={monitorCounts[tpl.id]}
                  onApply={() => setApplyTarget(tpl)}
                  onEdit={() => openEdit(tpl)}
                  onDelete={() => setDeleteTarget(tpl)}
                />
              ))}
            </div>
          )}
        </div>
      </Dialog>

      {/* Create / edit template */}
      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editing}
        defaultProvider={activeProvider}
        onSaved={handleSaved}
      />

      {/* Apply template to monitors */}
      <TemplateApplyPickerDialog
        open={!!applyTarget}
        onOpenChange={(o) => {
          if (!o) {
            setApplyTarget(null)
          }
        }}
        template={applyTarget}
        onApplied={() => setMonitorCounts({})}
      />

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !deleting) {
            setDeleteTarget(null)
          }
        }}
        title={t('Delete Template')}
        description={t(
          'This will permanently remove the template "{{name}}". Monitors already using it keep their current settings.',
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
          {t('Are you sure you want to delete this template?')}
        </p>
      </Dialog>
    </>
  )
}
