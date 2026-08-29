/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const promptReviewSchema = z.object({
  PromptReviewEnabled: z.boolean(),
  PromptReviewModel: z.string().trim().min(1).max(200),
  PromptReviewReasoningEffort: z.enum(['low', 'medium', 'high']),
  PromptReviewTimeoutMs: z.number().int().min(250).max(10000),
  PromptReviewBlockThreshold: z.number().min(0.5).max(1),
  PromptReviewFailMode: z.enum(['block_on_keyword', 'block', 'allow']),
})

type PromptReviewFormValues = z.infer<typeof promptReviewSchema>

type PromptReviewSectionProps = {
  defaultValues: PromptReviewFormValues
}

export function PromptReviewSection({
  defaultValues,
}: PromptReviewSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<PromptReviewFormValues>({
    resolver: zodResolver(promptReviewSchema),
    mode: 'onChange',
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const onSubmit = async (values: PromptReviewFormValues) => {
    const updates = Object.entries(values).filter(
      ([key, value]) =>
        value !== defaultValues[key as keyof PromptReviewFormValues]
    )
    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value })
    }
  }

  return (
    <SettingsSection title={t('Semantic prompt review')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel={t('Save prompt review')}
          />
          <FormField
            control={form.control}
            name='PromptReviewEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable semantic second pass')}</FormLabel>
                  <FormDescription>
                    {t(
                      'When enabled, send text-only GPT requests to the configured model for a second decision. Keyword filtering remains the fast first pass for other models.'
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

          <div className='grid gap-6 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='PromptReviewModel'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Review model')}</FormLabel>
                  <FormControl>
                    <Input placeholder='gpt-5.6-luna' {...field} />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Defaults to gpt-5.6-luna. You can enter another model available in this gateway.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='PromptReviewReasoningEffort'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Reasoning effort')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='low'>{t('Low')}</SelectItem>
                      <SelectItem value='medium'>{t('Medium')}</SelectItem>
                      <SelectItem value='high'>{t('High')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='PromptReviewTimeoutMs'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Review timeout')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={250}
                      max={10000}
                      step={50}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value) || 250)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Milliseconds, 250-10000')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='PromptReviewBlockThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Block confidence threshold')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0.5}
                      max={1}
                      step={0.01}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value) || 0.5)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Only high-confidence block decisions are enforced')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='PromptReviewFailMode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Review failure policy')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='block_on_keyword'>
                        {t('Keep keyword block')}
                      </SelectItem>
                      <SelectItem value='block'>
                        {t('Block on review error')}
                      </SelectItem>
                      <SelectItem value='allow'>
                        {t('Allow on review error')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t(
                      'Controls requests when the second-pass model times out or fails.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
