import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import ChannelMonitorView from '@/features/channel-monitor/view/channel-monitor-view'

export const Route = createFileRoute('/_authenticated/channel-monitors/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: ChannelMonitorView,
})
