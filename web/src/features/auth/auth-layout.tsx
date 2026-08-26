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
import { Link } from '@tanstack/react-router'
import { Activity, CircleDollarSign, Layers, PlugZap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

/* Upstream model families relayed by the gateway. Brand names are
 * intentionally not translated. */
const RELAYED_MODEL_BRANDS = [
  'GPT',
  'Claude',
  'Gemini',
  'Grok',
  'DeepSeek',
  'Qwen',
]

/* Business value props shown on the brand panel. Labels are i18n keys. */
const VALUE_PROPS = [
  { icon: Layers, label: '40+ model providers, one unified API' },
  { icon: PlugZap, label: 'OpenAI-compatible, integrate in minutes' },
  { icon: CircleDollarSign, label: 'Transparent pay-as-you-go billing' },
  {
    icon: Activity,
    label: 'High-availability relay with real-time monitoring',
  },
]

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  const brandBlock = (
    <Link
      to='/'
      className='flex items-center gap-2.5 transition-opacity hover:opacity-80'
    >
      <div className='relative h-9 w-9'>
        {loading ? (
          <Skeleton className='absolute inset-0 rounded-xl' />
        ) : (
          <img
            src={logo}
            alt={t('Logo')}
            className='h-9 w-9 rounded-xl object-cover'
          />
        )}
      </div>
      {loading ? (
        <Skeleton className='h-6 w-24' />
      ) : (
        <span className='text-lg font-semibold tracking-tight text-white'>
          {systemName}
        </span>
      )}
    </Link>
  )

  return (
    <div className='bg-background flex min-h-svh'>
      {/* Brand / business panel (desktop) */}
      <aside
        data-testid='auth-brand-panel'
        className='auth-brand-panel relative hidden overflow-hidden lg:flex lg:w-[52%] xl:w-[55%]'
      >
        {/* Decorative layers */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
        >
          <div className='auth-brand-grid absolute inset-0' />
          <div className='auth-aurora-blob top-[-20%] right-[-10%] h-[50vh] w-[30vw] min-w-[20rem] bg-[oklch(0.55_0.16_260)]/40' />
          <div className='auth-aurora-blob auth-aurora-blob--slow bottom-[-25%] left-[-8%] h-[55vh] w-[28vw] min-w-[18rem] bg-[oklch(0.5_0.15_290)]/35' />
        </div>

        <div className='relative z-10 flex w-full flex-col justify-between p-10 xl:p-14'>
          {brandBlock}

          <div className='max-w-xl space-y-8'>
            <h1 className='text-4xl leading-[1.15] font-semibold tracking-tight text-white xl:text-5xl'>
              {t('One gateway to leading AI models')}
            </h1>
            <p className='text-base leading-relaxed text-white/65 xl:text-lg'>
              {t(
                'Aggregate GPT, Claude, Gemini, Grok and more behind one stable, OpenAI-compatible API.'
              )}
            </p>

            <ul className='space-y-4'>
              {VALUE_PROPS.map((item) => (
                <li key={item.label} className='flex items-center gap-3'>
                  <span className='flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/8'>
                    <item.icon
                      className='size-4 text-white/85'
                      aria-hidden='true'
                    />
                  </span>
                  <span className='text-sm text-white/80 xl:text-[15px]'>
                    {t(item.label)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Relayed model brand chips */}
          <div
            data-testid='auth-brand-strip'
            className='flex flex-wrap items-center gap-2'
          >
            {RELAYED_MODEL_BRANDS.map((brand) => (
              <span
                key={brand}
                className='rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-medium tracking-wide text-white/65'
              >
                {brand}
              </span>
            ))}
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <div className='flex min-w-0 flex-1 flex-col'>
        {/* Compact brand hero (mobile / tablet) */}
        <div
          data-testid='auth-mobile-brand'
          className='auth-brand-panel relative overflow-hidden px-6 py-7 lg:hidden'
        >
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0'
          >
            <div className='auth-brand-grid absolute inset-0' />
          </div>
          <div className='relative z-10 flex flex-col items-center gap-2 text-center'>
            {brandBlock}
            <p className='text-xs text-white/60'>
              {t('One gateway to leading AI models')}
            </p>
          </div>
        </div>

        <main
          data-testid='auth-form-panel'
          className='flex flex-1 items-center justify-center px-4 py-10 sm:px-8'
        >
          <div className='w-full max-w-sm'>{children}</div>
        </main>
      </div>
    </div>
  )
}
