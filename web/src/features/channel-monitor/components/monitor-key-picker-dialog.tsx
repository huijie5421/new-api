import { Loader2, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { getApiKeys, fetchTokenKey } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { cn } from '@/lib/utils'

interface MonitorKeyPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (apiKey: string) => void
}

// status === 1 means the key is enabled (see ApiKey schema comment).
const STATUS_ENABLED = 1

export function MonitorKeyPickerDialog({
  open,
  onOpenChange,
  onPick,
}: MonitorKeyPickerDialogProps) {
  const { t } = useTranslation()

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [pickingId, setPickingId] = useState<number | null>(null)

  // Load the admin's own keys whenever the dialog opens.
  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    setSearch('')
    setPickingId(null)
    setLoading(true)
    void getApiKeys({ p: 1, size: 100 })
      .then((res) => {
        if (cancelled) {
          return
        }
        const items = res.data?.items ?? []
        // Only enabled keys are usable for a live health check.
        setKeys(items.filter((k) => k.status === STATUS_ENABLED))
      })
      .catch((err) => {
        if (cancelled) {
          return
        }
        const message =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || t('Failed to load API keys')
        toast.error(message)
        setKeys([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, t])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      return keys
    }
    return keys.filter((k) => {
      const name = (k.name || '').toLowerCase()
      const group = (k.group || '').toLowerCase()
      const masked = `sk-${k.key}`.toLowerCase()
      return name.includes(q) || group.includes(q) || masked.includes(q)
    })
  }, [keys, search])

  const handlePick = async (item: ApiKey) => {
    if (pickingId != null) {
      return
    }
    setPickingId(item.id)
    try {
      const res = await fetchTokenKey(item.id)
      const raw = res.data?.key
      if (!res.success || !raw) {
        toast.error(res.message || t('Failed to load the API key'))
        return
      }
      const value = raw.startsWith('sk-') ? raw : `sk-${raw}`
      onPick(value)
      onOpenChange(false)
    } catch (err) {
      // A 429 from the rate limiter has NO JSON body, so the generic
      // response?.data?.message lookup yields a misleading fallback. Surface a
      // clear, actionable message instead. Keep the dialog open and the
      // manual-input path intact (we just toast and reset pickingId below).
      const status = (err as { response?: { status?: number } })?.response
        ?.status
      if (status === 429) {
        toast.error(
          t(
            'Too many key requests, please wait a moment and retry, or paste the key manually'
          )
        )
        return
      }
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t('Failed to load the API key')
      toast.error(message)
    } finally {
      setPickingId(null)
    }
  }

  const noResultsMessage =
    keys.length === 0
      ? t('No enabled API keys found.')
      : t('No keys match your search.')

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pickingId == null) {
          onOpenChange(o)
        }
      }}
      title={t('Select my key')}
      description={t(
        'Pick one of your own enabled API keys to use for this monitor.'
      )}
      contentClassName='sm:max-w-lg'
      bodyClassName='space-y-3'
    >
      <div className='space-y-3'>
        {/* Search */}
        <div className='relative'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search by name, group, or key')}
            className='pl-8'
          />
        </div>

        {/* List */}
        <div className='border-border max-h-80 space-y-1 overflow-y-auto rounded-lg border p-1'>
          {loading && (
            <div className='text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm'>
              <Loader2 className='size-4 animate-spin' />
              {t('Loading...')}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className='text-muted-foreground py-8 text-center text-sm'>
              {noResultsMessage}
            </div>
          )}
          {!loading &&
            filtered.length > 0 &&
            filtered.map((item) => {
              const isPicking = pickingId === item.id
              return (
                <button
                  key={item.id}
                  type='button'
                  onClick={() => handlePick(item)}
                  disabled={pickingId != null}
                  className={cn(
                    'hover:bg-muted/60 flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                    'focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
                    pickingId != null && !isPicking && 'opacity-50',
                    'disabled:cursor-not-allowed'
                  )}
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <span className='truncate text-sm font-medium'>
                        {item.name || t('(unnamed)')}
                      </span>
                      {item.group ? (
                        <Badge variant='secondary' className='shrink-0'>
                          {item.group}
                        </Badge>
                      ) : null}
                      <Badge variant='outline' className='shrink-0'>
                        {t('Enabled')}
                      </Badge>
                    </div>
                    <div className='text-muted-foreground truncate font-mono text-xs'>
                      {`sk-${item.key}`}
                    </div>
                  </div>
                  {isPicking ? (
                    <Loader2 className='text-muted-foreground size-4 shrink-0 animate-spin' />
                  ) : null}
                </button>
              )
            })}
        </div>
      </div>
    </Dialog>
  )
}
