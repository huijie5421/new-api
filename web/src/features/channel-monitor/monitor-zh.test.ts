import { describe, expect, test } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import monitorFormSource from './components/monitor-form-dialog.tsx?raw'
import templateFormSource from './components/template-form-dialog.tsx?raw'

const ADMIN_MONITOR_KEYS = [
  'Channel Monitor',
  'Auto builds the request body; Minimal sends a tiny probe; Custom uses the JSON below.',
  'Configure an upstream channel health check for a provider model.',
  'Inject the global Claude Code identity (User-Agent, anthropic-beta, system prompt, metadata.user_id) so upstreams that require the official CLI accept the probe.',
  'Interval must be between {{min}} and {{max}} seconds',
  'Manage reusable request configurations and apply them to monitors.',
  'Overwrite the request configuration of the selected {{provider}} monitors with "{{name}}".',
  'Pick one of your own enabled API keys to use for this monitor.',
  'Reusable request configuration that can be applied to monitors of the same provider.',
  'This will permanently remove the template "{{name}}". Monitors already using it keep their current settings.',
  'Too many key requests, please wait a moment and retry, or paste the key manually',
  'Image Generations',
  'Image health-check success under 60 seconds is green; 60 seconds or slower is yellow; failures are red.',
  'Image timeout must be between 1 and 180 seconds',
] as const

describe('channel monitor Simplified Chinese copy', () => {
  test.each(ADMIN_MONITOR_KEYS)('translates %s', (key) => {
    const translated = (zh.translation as Record<string, string>)[key]
    expect(translated).toBeTruthy()
    expect(translated).not.toBe(key)
  })

  test.each([monitorFormSource, templateFormSource])(
    'renders API mode labels through i18n',
    (source) => {
      expect(source).toContain('label: t(m.label)')
      expect(source).toContain('{t(m.label)}')
      expect(source).toContain("value: 'image_generation'")
    }
  )
})
