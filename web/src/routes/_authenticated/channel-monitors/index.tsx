import { createFileRoute, redirect } from '@tanstack/react-router'

import ChannelMonitorView from '@/features/channel-monitor/view/channel-monitor-view'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/channel-monitors/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: ChannelMonitorView,
})
