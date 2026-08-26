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
import { act, fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import { RedeemCodeShopCard } from '../redeem-code-shop-card'

const shopUrl = 'https://catfk.com/shop/WWADEZ6N'

describe('RedeemCodeShopCard', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Buy redemption codes': 'Buy redemption codes',
      'Browse products here, then redeem your code below':
        'Browse products here, then redeem your code below',
      'Click to maximize': 'Click to maximize',
      'Open in new tab': 'Open in new tab',
      'Loading shop': 'Loading shop',
      'The shop did not load here. Continue in a new tab.':
        'The shop did not load here. Continue in a new tab.',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('renders the embedded shop and secure external links', () => {
    render(<RedeemCodeShopCard shopUrl={shopUrl} />)

    const iframe = screen.getByTitle('Buy redemption codes')
    expect(iframe).toHaveAttribute('src', shopUrl)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', shopUrl)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
    expect(screen.getByText('Loading shop')).toBeInTheDocument()
  })

  test('uses the fixed shop when the wallet setting is empty', () => {
    render(<RedeemCodeShopCard />)

    expect(screen.getByTitle('Buy redemption codes')).toHaveAttribute(
      'src',
      shopUrl
    )
  })

  test('keeps the embedded shop compact across wallet breakpoints', () => {
    render(<RedeemCodeShopCard shopUrl={shopUrl} />)

    expect(screen.getByTestId('redeem-shop-frame')).toHaveClass(
      'h-[24rem]',
      'sm:h-[30rem]',
      'overflow-hidden'
    )
  })

  test('removes the loading state after the iframe loads', () => {
    render(<RedeemCodeShopCard shopUrl={shopUrl} />)

    fireEvent.load(screen.getByTitle('Buy redemption codes'))

    expect(screen.queryByText('Loading shop')).not.toBeInTheDocument()
  })

  test('does not replace a loaded shop with a timeout fallback', () => {
    vi.useFakeTimers()
    render(<RedeemCodeShopCard shopUrl={shopUrl} />)

    fireEvent.load(screen.getByTitle('Buy redemption codes'))
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(
      screen.queryByText('The shop did not load here. Continue in a new tab.')
    ).not.toBeInTheDocument()
  })

  test('keeps an external fallback when the embedded shop times out', () => {
    vi.useFakeTimers()
    render(<RedeemCodeShopCard shopUrl={shopUrl} />)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(
      screen.getByText('The shop did not load here. Continue in a new tab.')
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  test('does not render for an unsafe shop URL', () => {
    render(<RedeemCodeShopCard shopUrl='http://catfk.com/shop/WWADEZ6N' />)

    expect(screen.queryByTitle('Buy redemption codes')).not.toBeInTheDocument()
  })
})
