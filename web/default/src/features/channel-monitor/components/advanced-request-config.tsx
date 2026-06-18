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
import { Plus, Trash2, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import type { BodyMode } from '../types'

export interface HeaderRow {
  key: string
  value: string
}

interface AdvancedRequestConfigProps {
  headerRows: HeaderRow[]
  bodyMode: BodyMode
  body: string
  bodyError: string | null
  onHeaderRowsChange: (rows: HeaderRow[]) => void
  onBodyModeChange: (mode: BodyMode) => void
  onBodyChange: (body: string) => void
  onBodyErrorChange: (error: string | null) => void
  idPrefix?: string
}

// Parse a JSON object string into key/value rows. Returns [] on invalid input.
export function parseHeaderRows(headers: string): HeaderRow[] {
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

// Serialize header rows (skipping blank keys) into a JSON object string.
export function buildHeadersJson(rows: HeaderRow[]): string {
  const filled = rows.filter((r) => r.key.trim())
  if (filled.length === 0) return ''
  const obj: Record<string, string> = {}
  for (const r of filled) obj[r.key.trim()] = r.value
  return JSON.stringify(obj)
}

export function AdvancedRequestConfig({
  headerRows,
  bodyMode,
  body,
  bodyError,
  onHeaderRowsChange,
  onBodyModeChange,
  onBodyChange,
  onBodyErrorChange,
  idPrefix = 'advanced',
}: AdvancedRequestConfigProps) {
  const { t } = useTranslation()

  const updateHeaderRow = (index: number, patch: Partial<HeaderRow>) => {
    onHeaderRowsChange(
      headerRows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  const addHeaderRow = () =>
    onHeaderRowsChange([...headerRows, { key: '', value: '' }])

  const removeHeaderRow = (index: number) =>
    onHeaderRowsChange(headerRows.filter((_, i) => i !== index))

  const validateBodyJson = (raw: string) => {
    if (!raw.trim()) {
      onBodyErrorChange(null)
      return
    }
    try {
      JSON.parse(raw)
      onBodyErrorChange(null)
    } catch (err) {
      onBodyErrorChange(err instanceof Error ? err.message : t('Invalid JSON'))
    }
  }

  const formatBody = () => {
    if (!body.trim()) return
    try {
      onBodyChange(JSON.stringify(JSON.parse(body), null, 2))
      onBodyErrorChange(null)
    } catch (err) {
      onBodyErrorChange(err instanceof Error ? err.message : t('Invalid JSON'))
      toast.error(t('Body is not valid JSON.'))
    }
  }

  const bodyId = `${idPrefix}-body`

  return (
    <div className='space-y-5'>
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
                onChange={(e) => updateHeaderRow(i, { key: e.target.value })}
                placeholder={t('Header')}
                className='font-mono'
              />
              <Input
                value={row.value}
                onChange={(e) => updateHeaderRow(i, { value: e.target.value })}
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
        <Button type='button' variant='outline' size='sm' onClick={addHeaderRow}>
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
          onValueChange={(v) => onBodyModeChange(v as BodyMode)}
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
          <Label htmlFor={bodyId}>{t('Request Body (JSON)')}</Label>
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
          id={bodyId}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onBlur={() => validateBodyJson(body)}
          placeholder='{ "max_tokens": 1 }'
          rows={6}
          className='font-mono text-xs'
          aria-invalid={!!bodyError}
        />
        {bodyError && <p className='text-destructive text-xs'>{bodyError}</p>}
      </div>
    </div>
  )
}
