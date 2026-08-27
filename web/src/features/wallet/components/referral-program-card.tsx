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
import { Gift, Users, TrendingUp, Share2, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface ReferralProgramCardProps {
  user: UserWalletData | null
  affiliateLink: string
  onTransfer: () => void
  onShowHistory?: () => void
  complianceConfirmed?: boolean
  loading?: boolean
  rebateEnabled?: boolean
  rebateRatio?: number
}

export function ReferralProgramCard({
  user,
  affiliateLink,
  onTransfer,
  onShowHistory,
  complianceConfirmed = true,
  loading,
  rebateEnabled,
  rebateRatio,
}: ReferralProgramCardProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <Card className='overflow-hidden'>
        <div className='bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-indigo-500/10 p-6'>
          <Skeleton className='h-6 w-40' />
          <Skeleton className='mt-2 h-4 w-full' />
          <div className='mt-6 space-y-4'>
            <Skeleton className='h-20 rounded-lg' />
            <Skeleton className='h-16 rounded-lg' />
            <Skeleton className='h-16 rounded-lg' />
          </div>
        </div>
      </Card>
    )
  }

  const hasRewards = (user?.aff_quota ?? 0) > 0
  const pendingRewards = user?.aff_quota ?? 0
  const totalEarned = user?.aff_history_quota ?? 0
  const inviteCount = user?.aff_count ?? 0
  const showRebate = !!rebateEnabled && (rebateRatio ?? 0) > 0

  return (
    <Card className='overflow-hidden border-purple-500/20 shadow-lg'>
      <div className='relative overflow-hidden'>
        {/* Gradient Background */}
        <div className='absolute inset-0 bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-indigo-500/10' />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.1),transparent_50%)]' />

        <CardContent className='relative p-6'>
          {/* Header */}
          <div className='mb-6 flex items-center gap-3'>
            <div className='flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 shadow-lg'>
              <Gift className='size-5 text-white' />
            </div>
            <div>
              <h3 className='text-lg font-bold'>{t('Referral Program')}</h3>
              <p className='text-muted-foreground text-xs'>
                {t('Earn rewards when your referrals add funds')}
              </p>
              {showRebate && (
                <p className='mt-1 text-xs font-medium text-purple-600 dark:text-purple-400'>
                  {t(
                    'Earn {{ratio}}% rebate when your referrals recharge online',
                    { ratio: rebateRatio }
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Main Stats - Pending Rewards (Prominent) */}
          <div className='bg-background/50 mb-4 rounded-xl border border-purple-500/20 p-4 backdrop-blur-sm'>
            <div className='flex items-center gap-2'>
              <div className='flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20'>
                <TrendingUp className='size-4 text-purple-600 dark:text-purple-400' />
              </div>
              <span className='text-muted-foreground text-sm font-medium'>
                {t('Pending Rewards')}
              </span>
            </div>
            <div className='mt-2 text-3xl font-bold tabular-nums'>
              {formatQuota(pendingRewards)}
            </div>
          </div>

          {/* Secondary Stats Grid */}
          <div className='mb-6 grid grid-cols-2 gap-3'>
            <div className='bg-background/50 rounded-lg border border-purple-500/10 p-3 backdrop-blur-sm'>
              <div className='flex items-center gap-1.5'>
                <div className='flex size-6 items-center justify-center rounded bg-blue-500/20'>
                  <TrendingUp className='size-3 text-blue-600 dark:text-blue-400' />
                </div>
                <span className='text-muted-foreground text-xs font-medium'>
                  {t('Total Earned')}
                </span>
              </div>
              <div className='mt-1.5 text-xl font-bold tabular-nums'>
                {formatQuota(totalEarned)}
              </div>
            </div>

            <div className='bg-background/50 rounded-lg border border-purple-500/10 p-3 backdrop-blur-sm'>
              <div className='flex items-center gap-1.5'>
                <div className='flex size-6 items-center justify-center rounded bg-indigo-500/20'>
                  <Users className='size-3 text-indigo-600 dark:text-indigo-400' />
                </div>
                <span className='text-muted-foreground text-xs font-medium'>
                  {t('Invites')}
                </span>
              </div>
              <div className='mt-1.5 text-xl font-bold tabular-nums'>
                {inviteCount}
              </div>
            </div>
          </div>

          {/* Referral Link Section */}
          <div className='space-y-3'>
            <label className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
              <Share2 className='size-3.5' />
              {t('Your Referral Link')}
            </label>
            <div className='flex gap-2'>
              <Input
                value={affiliateLink}
                readOnly
                className='bg-background/70 h-10 border-purple-500/20 font-mono text-xs'
              />
              <CopyButton
                value={affiliateLink}
                variant='outline'
                className='bg-background/70 size-10 shrink-0 border-purple-500/20'
                iconClassName='size-4'
                tooltip={t('Copy referral link')}
                aria-label={t('Copy referral link')}
              />
            </div>

            {/* Transfer Button */}
            {hasRewards && (
              <Button
                onClick={onTransfer}
                disabled={!complianceConfirmed}
                className='h-11 w-full bg-gradient-to-r from-purple-600 to-blue-600 font-semibold shadow-lg transition-all duration-200 hover:from-purple-700 hover:to-blue-700'
                size='lg'
              >
                <TrendingUp className='mr-2 size-4' />
                {t('Transfer to Balance')}
              </Button>
            )}

            {/* Compliance Warning */}
            {!complianceConfirmed && (
              <p className='text-muted-foreground rounded-lg bg-yellow-500/10 p-3 text-xs'>
                {t(
                  'Referral reward transfer is disabled until the administrator confirms compliance terms.'
                )}
              </p>
            )}

            {/* Rebate History */}
            {onShowHistory && (
              <Button
                onClick={onShowHistory}
                variant='outline'
                className='bg-background/70 h-10 w-full border-purple-500/20'
              >
                <History className='mr-2 size-4' />
                {t('Rebate History')}
              </Button>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  )
}
