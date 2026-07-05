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
import { useLocation } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { LanguageSwitcher } from '@/components/language-switcher'
import { AnimatedOutlet } from '@/components/page-transition'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { SkipToMain } from '@/components/skip-to-main'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'
import { SystemBrand } from './system-brand'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  const pathname = useLocation({ select: (location) => location.pathname })
  const topNavLinks = useTopNavLinks()
  const isAigcStandalone =
    pathname === '/image' ||
    pathname === '/image/' ||
    pathname === '/canvas' ||
    pathname === '/canvas/' ||
    pathname.startsWith('/canvas/')

  if (isAigcStandalone) {
    return (
      <LayoutProvider>
        <SearchProvider>
          <SkipToMain />
          <div className='bg-background flex h-svh min-h-0 flex-col overflow-hidden'>
            <header className='border-border/70 bg-background/85 flex h-16 shrink-0 items-center border-b px-4 backdrop-blur-xl'>
              <SystemBrand variant='inline' />
              <nav className='ms-6 hidden flex-1 items-center gap-1 overflow-x-auto md:flex'>
                {topNavLinks.slice(0, 6).map((link) => {
                  const active =
                    link.href === '/image'
                      ? pathname.startsWith('/image') ||
                        pathname.startsWith('/canvas')
                      : pathname === link.href ||
                        pathname.startsWith(`${link.href}/`)
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noreferrer' : undefined}
                      className={cn(
                        'text-muted-foreground hover:text-foreground rounded-full px-4 py-2 text-sm transition-colors',
                        active && 'bg-muted text-foreground'
                      )}
                    >
                      {link.title}
                    </a>
                  )
                })}
              </nav>
              <div className='ms-auto flex items-center gap-1.5'>
                <LanguageSwitcher />
                <ProfileDropdown />
              </div>
            </header>
            <div className='flex min-h-0 flex-1 overflow-hidden'>
              {props.children ?? <AnimatedOutlet />}
            </div>
          </div>
        </SearchProvider>
      </LayoutProvider>
    )
  }

  return (
    <LayoutProvider>
      <SearchProvider>
        <SidebarProvider defaultOpen={defaultOpen} className='flex-col'>
          <SkipToMain />
          <AppHeader />
          <div className='flex min-h-0 w-full flex-1'>
            <AppSidebar />
            <SidebarInset
              className={cn(
                '@container/content',
                'h-[calc(100svh-var(--app-header-height,0px))]',
                'min-h-0 overflow-hidden',
                'peer-data-[variant=inset]:h-[calc(100svh-var(--app-header-height,0px)-(var(--spacing)*4))]'
              )}
            >
              {props.children ?? <AnimatedOutlet />}
            </SidebarInset>
          </div>
        </SidebarProvider>
      </SearchProvider>
    </LayoutProvider>
  )
}
