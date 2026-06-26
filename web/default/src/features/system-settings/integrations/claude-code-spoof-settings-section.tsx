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
import { useMemo, useRef } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'

// JSON-object string validator (empty string allowed).
const jsonObjectString = z.string().refine((value) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const parsed = JSON.parse(trimmed)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}, 'Must be a valid JSON object')

// Nested object schema so react-hook-form treats the dotted option keys as a
// nested path (field name "claude_code_spoof_setting.enabled" maps to
// values.claude_code_spoof_setting.enabled). Submission flattens back to the
// "module.field" option keys the backend expects.
const spoofSchema = z.object({
  claude_code_spoof_setting: z.object({
    enabled: z.boolean(),
    override_user_system: z.boolean(),
    user_agent: z.string(),
    anthropic_version: z.string(),
    x_app: z.string(),
    anthropic_beta: z.string(),
    system_prompt: z.string(),
    metadata_user_id: z.string(),
    extra_headers: jsonObjectString,
  }),
})

type SpoofFormValues = z.output<typeof spoofSchema>

type SpoofSettingsSectionProps = {
  defaultValues: {
    'claude_code_spoof_setting.enabled': boolean
    'claude_code_spoof_setting.override_user_system': boolean
    'claude_code_spoof_setting.user_agent': string
    'claude_code_spoof_setting.anthropic_version': string
    'claude_code_spoof_setting.x_app': string
    'claude_code_spoof_setting.anthropic_beta': string
    'claude_code_spoof_setting.system_prompt': string
    'claude_code_spoof_setting.metadata_user_id': string
    'claude_code_spoof_setting.extra_headers': string
  }
}

const buildDefaults = (
  defaults: SpoofSettingsSectionProps['defaultValues']
): SpoofFormValues => ({
  claude_code_spoof_setting: {
    enabled: defaults['claude_code_spoof_setting.enabled'],
    override_user_system:
      defaults['claude_code_spoof_setting.override_user_system'],
    user_agent: defaults['claude_code_spoof_setting.user_agent'] ?? '',
    anthropic_version:
      defaults['claude_code_spoof_setting.anthropic_version'] ?? '',
    x_app: defaults['claude_code_spoof_setting.x_app'] ?? '',
    anthropic_beta: defaults['claude_code_spoof_setting.anthropic_beta'] ?? '',
    system_prompt: defaults['claude_code_spoof_setting.system_prompt'] ?? '',
    metadata_user_id:
      defaults['claude_code_spoof_setting.metadata_user_id'] ?? '',
    extra_headers: defaults['claude_code_spoof_setting.extra_headers'] ?? '',
  },
})

export function ClaudeCodeSpoofSettingsSection({
  defaultValues,
}: SpoofSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const baselineRef = useRef<SpoofFormValues>(buildDefaults(defaultValues))

  const formDefaults = useMemo(
    () => buildDefaults(defaultValues),
    [defaultValues]
  )

  const form = useForm<SpoofFormValues>({
    resolver: zodResolver(spoofSchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  const onSubmit = async (values: SpoofFormValues) => {
    const next = values.claude_code_spoof_setting
    const baseline = baselineRef.current.claude_code_spoof_setting

    const entries = (
      Object.keys(next) as Array<keyof typeof next>
    ).filter((key) => next[key] !== baseline[key])

    if (entries.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of entries) {
      await updateOption.mutateAsync({
        key: `claude_code_spoof_setting.${key}`,
        value: next[key],
      })
    }

    baselineRef.current = values
  }

  return (
    <SettingsSection title={t('Claude Code Spoof')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save Claude Code spoof'
          />

          <p className='text-muted-foreground text-sm'>
            {t(
              'Make Anthropic channel-monitor probes look like the official Claude Code CLI (User-Agent, anthropic-beta, system prompt, and metadata.user_id). Enable the "Claude Code spoof" switch on an Anthropic monitor to use these values.'
            )}
          </p>

          <div className='grid gap-6 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='claude_code_spoof_setting.enabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Enable spoof globally')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Reserved master switch. Per-monitor toggles currently control injection.'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='claude_code_spoof_setting.override_user_system'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Override user system prompt')}</FormLabel>
                    <FormDescription>
                      {t(
                        'When on, only the spoof system prompt is sent. When off, it is prepended before any custom system entries.'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
          </div>

          <div className='grid gap-6 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='claude_code_spoof_setting.user_agent'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('User-Agent')}</FormLabel>
                  <FormControl>
                    <Input
                      className='font-mono'
                      placeholder='claude-cli/2.1.161 (external, cli)'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='claude_code_spoof_setting.anthropic_version'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('anthropic-version')}</FormLabel>
                  <FormControl>
                    <Input
                      className='font-mono'
                      placeholder='2023-06-01'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='claude_code_spoof_setting.x_app'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('X-App')}</FormLabel>
                <FormControl>
                  <Input className='font-mono' placeholder='cli' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='claude_code_spoof_setting.anthropic_beta'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('anthropic-beta')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    className='font-mono text-xs'
                    placeholder='claude-code-20250219,oauth-2025-04-20,...'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Comma-separated beta tokens sent in the anthropic-beta header.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='claude_code_spoof_setting.system_prompt'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('System prompt')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    className='font-mono text-xs'
                    placeholder="You are Claude Code, Anthropic's official CLI for Claude."
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Injected as the first system block. Must match the official prompt to pass upstream checks.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='claude_code_spoof_setting.metadata_user_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('metadata.user_id')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    className='font-mono text-xs'
                    placeholder='user_<64hex>_account_<uuid>_session_<uuid>'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Injected into body.metadata.user_id. Must satisfy the official format.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='claude_code_spoof_setting.extra_headers'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Extra headers (JSON)')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={5}
                    className='font-mono text-xs'
                    placeholder='{ "X-Stainless-Lang": "js" }'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Additional headers (e.g. X-Stainless-*) merged before the fixed spoof headers.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
