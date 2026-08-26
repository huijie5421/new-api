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
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import type { PricingModel } from '../../types'
import { ModelCard } from '../model-card'

const copyToClipboard = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard }),
}))

// Icon lookup drags in the emoji-mart data set, which vitest cannot import
// as a bare JSON module. The icon itself is not the behavior under test.
vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: () => null,
}))

function buildTokenModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    id: 1,
    model_name: 'gpt-test-1',
    description: 'A capable general-purpose model.',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 2,
    enable_groups: ['default'],
    tags: 'chat,vision',
    supported_endpoint_types: ['openai'],
    ...overrides,
  }
}

describe('ModelCard', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      Details: 'Details',
      Copy: 'Copy',
      Input: 'Input',
      Output: 'Output',
    })
  })

  beforeEach(() => {
    copyToClipboard.mockClear()
  })

  test('renders the model identity and token price summary', () => {
    render(<ModelCard model={buildTokenModel()} onClick={() => {}} />)

    expect(screen.getByText('gpt-test-1')).toBeInTheDocument()
    expect(
      screen.getByText('A capable general-purpose model.')
    ).toBeInTheDocument()
    expect(screen.getByText('Input')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
  })

  test('keeps the elevated card container contract for the plaza grid', () => {
    render(<ModelCard model={buildTokenModel()} onClick={() => {}} />)

    const card = screen.getByTestId('pricing-model-card')
    expect(card).toHaveClass('rounded-2xl', 'border', 'bg-card', 'flex-col')
  })

  test('opens details from the Details action', () => {
    const onClick = vi.fn()
    render(<ModelCard model={buildTokenModel()} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button', { name: /Details/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('copies the model name without triggering the details action', () => {
    const onClick = vi.fn()
    render(<ModelCard model={buildTokenModel()} onClick={onClick} />)

    fireEvent.click(screen.getByTitle('Copy'))
    expect(copyToClipboard).toHaveBeenCalledWith('gpt-test-1')
    expect(onClick).not.toHaveBeenCalled()
  })

  test('falls back to the model initial when no icon is configured', () => {
    render(
      <ModelCard
        model={buildTokenModel({ model_name: 'zeta-model', icon: undefined })}
        onClick={() => {}}
      />
    )

    expect(screen.getByText('Z')).toBeInTheDocument()
  })
})
