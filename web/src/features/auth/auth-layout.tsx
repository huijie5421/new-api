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
import { ArrowUpRight, Circle, Command, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='auth-shell relative min-h-svh overflow-hidden'>
      <div className='auth-grid absolute inset-0' aria-hidden='true' />
      <div className='auth-shell-noise absolute inset-0' aria-hidden='true' />

      <div className='relative z-10 grid min-h-svh lg:grid-cols-[minmax(420px,0.86fr)_minmax(520px,1.14fr)]'>
        <section className='auth-hero relative hidden overflow-hidden border-r border-white/10 px-10 py-10 text-white lg:flex lg:flex-col xl:px-16'>
          <div className='flex items-center justify-between'>
            <Link
              to='/'
              className='group flex items-center gap-3 transition-opacity hover:opacity-85'
            >
              <div className='relative flex size-10 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-2xl shadow-black/20 backdrop-blur'>
                {loading ? (
                  <Skeleton className='absolute inset-0 rounded-2xl bg-white/10' />
                ) : (
                  <img
                    src={logo}
                    alt={t('Logo')}
                    className='h-full w-full object-cover'
                  />
                )}
              </div>
              {loading ? (
                <Skeleton className='h-5 w-28 bg-white/10' />
              ) : (
                <div>
                  <p className='text-[10px] font-semibold tracking-[0.28em] text-white/45 uppercase'>
                    Gateway
                  </p>
                  <h1 className='text-[15px] font-semibold tracking-tight text-white'>
                    {systemName}
                  </h1>
                </div>
              )}
            </Link>
            <div className='flex items-center gap-2 text-[10px] font-medium tracking-[0.22em] text-white/45 uppercase'>
              <span className='auth-live-dot' />
              Live plane
            </div>
          </div>

          <div className='relative mt-auto mb-auto max-w-xl py-20'>
            <div className='mb-7 flex items-center gap-3 text-xs font-medium tracking-[0.22em] text-[#f6b28c] uppercase'>
              <span className='h-px w-10 bg-[#f6b28c]' />
              AI infrastructure, refined
            </div>
            <h2 className='max-w-[680px] text-5xl leading-[0.98] font-semibold tracking-[-0.055em] text-balance xl:text-7xl'>
              Your models,
              <br />
              <span className='auth-hero-accent'>in motion.</span>
            </h2>
            <p className='mt-8 max-w-md text-[15px] leading-7 text-white/58'>
              One composed workspace for routing, usage, creative workflows and
              the invisible details that keep every request moving.
            </p>

            <div className='mt-12 grid max-w-lg grid-cols-3 gap-3'>
              <div className='auth-stat'>
                <Command className='mb-5 size-4 text-[#9dd9e8]' />
                <span className='text-lg font-semibold tracking-tight text-white'>
                  01
                </span>
                <span className='mt-1 text-[10px] tracking-[0.18em] text-white/38 uppercase'>
                  Route
                </span>
              </div>
              <div className='auth-stat'>
                <Sparkles className='mb-5 size-4 text-[#f6b28c]' />
                <span className='text-lg font-semibold tracking-tight text-white'>
                  ∞
                </span>
                <span className='mt-1 text-[10px] tracking-[0.18em] text-white/38 uppercase'>
                  Create
                </span>
              </div>
              <div className='auth-stat'>
                <Circle className='mb-5 size-3 fill-[#b6e3c6] text-[#b6e3c6]' />
                <span className='text-lg font-semibold tracking-tight text-white'>
                  24/7
                </span>
                <span className='mt-1 text-[10px] tracking-[0.18em] text-white/38 uppercase'>
                  Control
                </span>
              </div>
            </div>
          </div>

          <div className='flex items-end justify-between text-xs text-white/35'>
            <span className='max-w-[220px] leading-5'>
              A quieter interface for serious model work.
            </span>
            <ArrowUpRight className='size-5 text-white/55' />
          </div>
        </section>

        <main className='relative flex min-h-svh items-center justify-center px-5 py-8 sm:px-10 lg:px-14 xl:px-24'>
          <div className='auth-mobile-brand absolute top-6 left-5 flex items-center gap-3 lg:hidden'>
            <div className='border-border/70 bg-card flex size-9 items-center justify-center overflow-hidden rounded-xl border shadow-sm'>
              {loading ? (
                <Skeleton className='absolute size-9 rounded-xl' />
              ) : (
                <img
                  src={logo}
                  alt={t('Logo')}
                  className='size-full object-cover'
                />
              )}
            </div>
            <span className='text-sm font-semibold tracking-tight'>
              {systemName}
            </span>
          </div>
          <div className='auth-form-frame w-full max-w-[470px] pt-16 lg:pt-0'>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
