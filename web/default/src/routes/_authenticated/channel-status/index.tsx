import { createFileRoute } from '@tanstack/react-router'
import ChannelStatusView from '@/features/channel-status/view/channel-status-view'

export const Route = createFileRoute('/_authenticated/channel-status/')({
  component: ChannelStatusView,
})
