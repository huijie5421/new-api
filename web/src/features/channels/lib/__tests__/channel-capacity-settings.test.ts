/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, test } from 'vitest'

import {
  CHANNEL_FORM_DEFAULT_VALUES,
  MAX_CHANNEL_CONCURRENT_REQUESTS,
  MAX_CHANNEL_REQUESTS_PER_MINUTE,
  buildSettingJSON,
  channelFormSchema,
} from '../channel-form'

function form(overrides: Record<string, unknown> = {}) {
  return {
    ...CHANNEL_FORM_DEFAULT_VALUES,
    name: 'Capacity limited channel',
    type: 1,
    key: 'test-key',
    models: 'gpt-test',
    ...overrides,
  }
}

describe('Channel capacity settings', () => {
  test('accepts zero and positive limits and rejects invalid bounds', () => {
    expect(channelFormSchema.safeParse(form()).success).toBe(true)
    expect(
      channelFormSchema.safeParse(
        form({ max_concurrent_requests: 20, requests_per_minute: 300 })
      ).success
    ).toBe(true)
    expect(
      channelFormSchema.safeParse(form({ max_concurrent_requests: -1 })).success
    ).toBe(false)
    expect(
      channelFormSchema.safeParse(
        form({ max_concurrent_requests: MAX_CHANNEL_CONCURRENT_REQUESTS + 1 })
      ).success
    ).toBe(false)
    expect(
      channelFormSchema.safeParse(
        form({ requests_per_minute: MAX_CHANNEL_REQUESTS_PER_MINUTE + 1 })
      ).success
    ).toBe(false)
  })

  test('serializes configured limits and omits unlimited defaults', () => {
    const configured = channelFormSchema.parse(
      form({ max_concurrent_requests: 20, requests_per_minute: 300 })
    )
    expect(JSON.parse(buildSettingJSON(configured))).toMatchObject({
      max_concurrent_requests: 20,
      requests_per_minute: 300,
    })

    const unlimited = JSON.parse(
      buildSettingJSON(channelFormSchema.parse(form()))
    )
    expect(unlimited).not.toHaveProperty('max_concurrent_requests')
    expect(unlimited).not.toHaveProperty('requests_per_minute')
  })
})
