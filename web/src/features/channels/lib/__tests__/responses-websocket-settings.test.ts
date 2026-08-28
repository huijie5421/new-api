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
  buildSettingJSON,
  channelFormSchema,
} from '../channel-form'

function form(overrides: Record<string, unknown> = {}) {
  return {
    ...CHANNEL_FORM_DEFAULT_VALUES,
    name: 'Sub2API upstream',
    type: 59,
    key: 'test-key',
    models: 'gpt-test',
    ...overrides,
  }
}

describe('Responses upstream WebSocket channel settings', () => {
  test('accepts ws/wss overrides and rejects HTTP overrides', () => {
    expect(
      channelFormSchema.safeParse(
        form({
          responses_ws_upstream_enabled: true,
          responses_ws_upstream_url: 'wss://upstream.example/v1/responses',
        })
      ).success
    ).toBe(true)
    expect(
      channelFormSchema.safeParse(
        form({
          responses_ws_upstream_enabled: true,
          responses_ws_upstream_url: 'https://upstream.example/v1/responses',
        })
      ).success
    ).toBe(false)
  })

  test('serializes the switch and optional override in setting JSON', () => {
    const parsed = channelFormSchema.parse(
      form({
        responses_ws_upstream_enabled: true,
        responses_ws_upstream_url: 'wss://upstream.example/v1/responses',
      })
    )
    expect(JSON.parse(buildSettingJSON(parsed))).toMatchObject({
      responses_ws_upstream_enabled: true,
      responses_ws_upstream_url: 'wss://upstream.example/v1/responses',
    })
  })
})
