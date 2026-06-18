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
import { useState, useEffect, useCallback } from 'react'
import { Gift, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import i18next from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatQuota, formatTimestamp } from '@/lib/format'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog } from '@/components/dialog'
import { getRebateHistory, getInvitees, isApiSuccess } from '../../api'
import type { RebateRecord, InviteeRecord } from '../../types'

interface RebateHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100']

function PageSizeSelect({
  pageSize,
  onChange,
}: {
  pageSize: number
  onChange: (size: number) => void
}) {
  const { t } = useTranslation()
  return (
    <Select
      items={PAGE_SIZE_OPTIONS.map((value) => ({
        value,
        label: t(`${value} / page`),
      }))}
      value={pageSize.toString()}
      onValueChange={(value) => value !== null && onChange(parseInt(value))}
    >
      <SelectTrigger className='h-9 w-[92px] sm:w-32'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {PAGE_SIZE_OPTIONS.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`${value} / page`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className='flex flex-col items-center gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='text-muted-foreground text-xs sm:text-sm'>
        {t('Showing')} {total === 0 ? 0 : (page - 1) * pageSize + 1}-
        {Math.min(page * pageSize, total)} {t('of')} {total}
      </div>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className='h-8 w-8 p-0'
        >
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <div className='text-muted-foreground flex items-center gap-1 text-sm'>
          <span className='font-medium'>{page}</span>
          <span>/</span>
          <span>{totalPages}</span>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className='h-8 w-8 p-0'
        >
          <ChevronRight className='h-4 w-4' />
        </Button>
      </div>
    </div>
  )
}

function RebateRecordsTab({ active }: { active: boolean }) {
  const { t } = useTranslation()
  const [records, setRecords] = useState<RebateRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getRebateHistory(page, pageSize)
      if (isApiSuccess(response) && response.data) {
        setRecords(response.data.items || [])
        setTotal(response.data.total || 0)
      } else {
        toast.error(
          response.message || i18next.t('Failed to load rebate history')
        )
        setRecords([])
        setTotal(0)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch rebate history:', error)
      toast.error(i18next.t('Failed to load rebate history'))
      setRecords([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    if (active) {
      fetchRecords()
    }
  }, [active, fetchRecords])

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-end'>
        <PageSizeSelect
          pageSize={pageSize}
          onChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </div>
      <ScrollArea className='max-h-[min(48vh,460px)] pr-3 sm:pr-4'>
        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full rounded-md' />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className='text-muted-foreground flex min-h-40 flex-col items-center justify-center py-10 text-center'>
            <p className='text-sm font-medium'>
              {t('No rebate records found')}
            </p>
            <p className='mt-1 text-xs'>
              {t('Rebates appear here when your referrals recharge online')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Invitee')}</TableHead>
                <TableHead className='text-right'>{t('Recharged')}</TableHead>
                <TableHead className='text-right'>{t('Rebate')}</TableHead>
                <TableHead className='text-right'>{t('Ratio')}</TableHead>
                <TableHead>{t('Order Number')}</TableHead>
                <TableHead>{t('Time')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className='font-medium'>
                    {record.source_username || `#${record.source_user_id}`}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatQuota(record.recharged_quota)}
                  </TableCell>
                  <TableCell className='text-right font-semibold tabular-nums text-green-600 dark:text-green-400'>
                    {formatQuota(record.quota)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {record.ratio}%
                  </TableCell>
                  <TableCell className='max-w-[160px] truncate font-mono text-xs'>
                    {record.trade_no}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs'>
                    {formatTimestamp(record.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
      {!loading && records.length > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

function InviteesTab({ active }: { active: boolean }) {
  const { t } = useTranslation()
  const [records, setRecords] = useState<InviteeRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getInvitees(page, pageSize)
      if (isApiSuccess(response) && response.data) {
        setRecords(response.data.items || [])
        setTotal(response.data.total || 0)
      } else {
        toast.error(response.message || i18next.t('Failed to load invitees'))
        setRecords([])
        setTotal(0)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch invitees:', error)
      toast.error(i18next.t('Failed to load invitees'))
      setRecords([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    if (active) {
      fetchRecords()
    }
  }, [active, fetchRecords])

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-end'>
        <PageSizeSelect
          pageSize={pageSize}
          onChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </div>
      <ScrollArea className='max-h-[min(48vh,460px)] pr-3 sm:pr-4'>
        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full rounded-md' />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className='text-muted-foreground flex min-h-40 flex-col items-center justify-center py-10 text-center'>
            <p className='text-sm font-medium'>{t('No invitees yet')}</p>
            <p className='mt-1 text-xs'>
              {t('Share your referral link to invite users')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Username')}</TableHead>
                <TableHead>{t('Joined')}</TableHead>
                <TableHead className='text-right'>{t('Used')}</TableHead>
                <TableHead className='text-right'>{t('Balance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className='font-medium'>
                    {record.display_name || record.username}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs'>
                    {formatTimestamp(record.created_at)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatQuota(record.used_quota)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatQuota(record.quota)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
      {!loading && records.length > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

export function RebateHistoryDialog({
  open,
  onOpenChange,
}: RebateHistoryDialogProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('rebate')

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Rebate History')}
      description={t(
        'Track rebates earned from your referrals and the users you invited'
      )}
      contentClassName='flex max-h-[calc(100dvh-2rem)] flex-col max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4 sm:max-w-4xl'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value='rebate'>
            <Gift className='size-4' />
            {t('Rebate Records')}
          </TabsTrigger>
          <TabsTrigger value='invitees'>
            <Users className='size-4' />
            {t('My Invitees')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='rebate'>
          <RebateRecordsTab active={open && tab === 'rebate'} />
        </TabsContent>
        <TabsContent value='invitees'>
          <InviteesTab active={open && tab === 'invitees'} />
        </TabsContent>
      </Tabs>
    </Dialog>
  )
}
