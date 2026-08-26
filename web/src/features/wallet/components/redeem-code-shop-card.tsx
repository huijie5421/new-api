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
import { ExternalLink, Maximize2, ShoppingBag } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'

import {
  DEFAULT_REDEEM_SHOP_URL,
  normalizeRedeemShopUrl,
} from '../lib/redeem-shop'

type RedeemCodeShopCardProps = {
  shopUrl?: string
}

type ShopLoadState = 'loading' | 'loaded' | 'timed-out'

const SHOP_LOAD_TIMEOUT_MS = 10_000
const SHOP_SANDBOX = [
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-same-origin',
  'allow-scripts',
  'allow-top-navigation-by-user-activation',
].join(' ')

export function RedeemCodeShopCard(props: RedeemCodeShopCardProps) {
  const { t } = useTranslation()
  const normalizedShopUrl = normalizeRedeemShopUrl(
    props.shopUrl || DEFAULT_REDEEM_SHOP_URL
  )
  const [loadState, setLoadState] = useState<ShopLoadState>('loading')
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!normalizedShopUrl) {
      return
    }
    setLoadState('loading')
    timeoutRef.current = window.setTimeout(() => {
      setLoadState('timed-out')
    }, SHOP_LOAD_TIMEOUT_MS)
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [normalizedShopUrl])

  if (!normalizedShopUrl) {
    return null
  }

  const externalLinkProps = {
    href: normalizedShopUrl,
    target: '_blank',
    rel: 'noopener noreferrer',
  } as const

  return (
    <TitledCard
      title={t('Buy redemption codes')}
      description={t('Browse products here, then redeem your code below')}
      icon={<ShoppingBag aria-hidden='true' />}
      iconTone='chart-3'
      disableHoverEffect
      contentClassName='p-0'
      action={
        <a
          {...externalLinkProps}
          aria-label={t('Open in new tab')}
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
            className: 'w-full sm:hidden',
          })}
        >
          <ExternalLink data-icon='inline-start' aria-hidden='true' />
          {t('Open in new tab')}
        </a>
      }
    >
      <div
        data-testid='redeem-shop-frame'
        className='group/shop bg-muted/25 relative h-[24rem] overflow-hidden sm:h-[30rem]'
      >
        {/* The shop needs its own scripts and same-origin storage for checkout. */}
        <iframe
          src={normalizedShopUrl}
          title={t('Buy redemption codes')}
          className='bg-background size-full border-0'
          allow='payment'
          loading='eager'
          referrerPolicy='strict-origin-when-cross-origin'
          sandbox={SHOP_SANDBOX}
          onLoad={() => {
            if (timeoutRef.current !== null) {
              window.clearTimeout(timeoutRef.current)
              timeoutRef.current = null
            }
            setLoadState('loaded')
          }}
        />

        {loadState === 'loading' ? (
          <div className='bg-background/90 text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-sm'>
            {t('Loading shop')}
          </div>
        ) : null}

        {loadState === 'timed-out' ? (
          <div className='bg-background/90 text-muted-foreground pointer-events-none absolute inset-x-0 top-0 flex min-h-14 items-center justify-center border-b px-4 text-center text-xs sm:text-sm'>
            {t('The shop did not load here. Continue in a new tab.')}
          </div>
        ) : null}

        <div className='pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/20 opacity-0 backdrop-blur-[1px] transition-opacity group-focus-within/shop:opacity-100 group-hover/shop:opacity-100 sm:flex'>
          <a
            {...externalLinkProps}
            aria-label={t('Click to maximize')}
            className={buttonVariants({
              className: 'pointer-events-auto shadow-lg',
            })}
          >
            <Maximize2 data-icon='inline-start' aria-hidden='true' />
            {t('Click to maximize')}
          </a>
        </div>
      </div>
    </TitledCard>
  )
}
