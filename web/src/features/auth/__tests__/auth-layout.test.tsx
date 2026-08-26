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
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import { AuthLayout } from '../auth-layout'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    className?: string
    children?: React.ReactNode
  }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Test Gateway',
    logo: '/test-logo.png',
    loading: false,
  }),
}))

describe('AuthLayout', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      Logo: 'Logo',
      'One gateway to leading AI models': 'One gateway to leading AI models',
      'Aggregate GPT, Claude, Gemini, Grok and more behind one stable, OpenAI-compatible API.':
        'Aggregate GPT, Claude, Gemini, Grok and more behind one stable, OpenAI-compatible API.',
      '40+ model providers, one unified API':
        '40+ model providers, one unified API',
      'OpenAI-compatible, integrate in minutes':
        'OpenAI-compatible, integrate in minutes',
      'Transparent pay-as-you-go billing': 'Transparent pay-as-you-go billing',
      'High-availability relay with real-time monitoring':
        'High-availability relay with real-time monitoring',
    })
  })

  test('hosts the auth form content inside the form panel', () => {
    render(
      <AuthLayout>
        <p>form content</p>
      </AuthLayout>
    )

    expect(screen.getByTestId('auth-form-panel')).toContainElement(
      screen.getByText('form content')
    )
  })

  test('introduces the gateway business on the desktop brand panel', () => {
    render(
      <AuthLayout>
        <p>form content</p>
      </AuthLayout>
    )

    const panel = screen.getByTestId('auth-brand-panel')
    expect(panel).toHaveTextContent('One gateway to leading AI models')
    expect(panel).toHaveTextContent(
      'Aggregate GPT, Claude, Gemini, Grok and more behind one stable, OpenAI-compatible API.'
    )
    expect(panel).toHaveTextContent('40+ model providers, one unified API')
    expect(panel).toHaveTextContent('OpenAI-compatible, integrate in minutes')
    expect(panel).toHaveTextContent('Transparent pay-as-you-go billing')
    expect(panel).toHaveTextContent(
      'High-availability relay with real-time monitoring'
    )
  })

  test('collapses the brand panel to a compact hero below the desktop breakpoint', () => {
    render(
      <AuthLayout>
        <p>form content</p>
      </AuthLayout>
    )

    expect(screen.getByTestId('auth-brand-panel')).toHaveClass(
      'hidden',
      'lg:flex'
    )
    const mobileBrand = screen.getByTestId('auth-mobile-brand')
    expect(mobileBrand).toHaveClass('lg:hidden')
    expect(mobileBrand).toHaveTextContent('One gateway to leading AI models')
  })

  test('links every brand block back to the home entry', () => {
    render(
      <AuthLayout>
        <p>form content</p>
      </AuthLayout>
    )

    const logos = screen.getAllByAltText('Logo')
    expect(logos.length).toBeGreaterThan(0)
    for (const logo of logos) {
      expect(logo.closest('a')).toHaveAttribute('href', '/')
    }
    expect(screen.getAllByText('Test Gateway').length).toBeGreaterThan(0)
  })

  test('shows the relayed model brand chips on the brand panel', () => {
    render(
      <AuthLayout>
        <p>form content</p>
      </AuthLayout>
    )

    const strip = screen.getByTestId('auth-brand-strip')
    for (const brand of [
      'GPT',
      'Claude',
      'Gemini',
      'Grok',
      'DeepSeek',
      'Qwen',
    ]) {
      expect(strip).toHaveTextContent(brand)
    }
  })
})
