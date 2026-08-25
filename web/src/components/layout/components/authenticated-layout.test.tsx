import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const location = vi.hoisted(() => ({ pathname: '/image' }))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => location,
}))

vi.mock('@/components/page-transition', () => ({
  AnimatedOutlet: () => <div>outlet</div>,
}))
vi.mock('@/components/skip-to-main', () => ({ SkipToMain: () => null }))
vi.mock('@/components/ui/sidebar', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
vi.mock('@/context/layout-provider', () => ({
  LayoutProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/context/search-provider', () => ({
  SearchProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/lib/cookies', () => ({ getCookie: () => undefined }))
vi.mock('./app-header', () => ({
  AppHeader: () => <header>top navigation</header>,
}))
vi.mock('./app-sidebar', () => ({
  AppSidebar: () => <aside>console sidebar</aside>,
}))

import { AuthenticatedLayout } from './authenticated-layout'

describe('AuthenticatedLayout AIGC shell', () => {
  beforeEach(() => {
    location.pathname = '/image'
  })

  test('keeps the top navigation and hides only the console sidebar', () => {
    render(<AuthenticatedLayout>workshop</AuthenticatedLayout>)

    expect(screen.getByText('top navigation')).toBeInTheDocument()
    expect(screen.queryByText('console sidebar')).not.toBeInTheDocument()
    expect(screen.getByText('workshop')).toBeInTheDocument()
  })
})
