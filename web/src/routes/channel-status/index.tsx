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
import { createFileRoute } from '@tanstack/react-router'

import { PublicLayout } from '@/components/layout'
import ChannelStatusView from '@/features/channel-status/view/channel-status-view'

// 渠道状态页对所有访客公开,无需登录即可查看中转站运行状态。
export const Route = createFileRoute('/channel-status/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <PublicLayout>
      <ChannelStatusView />
    </PublicLayout>
  )
}
