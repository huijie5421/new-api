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
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatLocalCurrencyAmount } from '@/lib/currency'

import { getTopUpStatus, isApiSuccess } from '../../api'
import { DEFAULT_DISCOUNT_RATE } from '../../constants'
import { formatCurrency, getPaymentIcon, submitPaymentForm } from '../../lib'
import type { EpayPaymentDetail, PaymentMethod } from '../../types'

// Poll the order status every 3s for at most 5 minutes.
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Decide whether a qr_url should be rendered directly as an <img> (it already
 * points to a QR image / data URI) or encoded into a QR via QRCodeSVG (it is a
 * payment link / scheme such as qr.alipay.com, wxp://, weixin://, alipayqr://).
 */
function isLikelyImageUrl(value: string): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  if (lower.startsWith('data:image')) return true
  if (/\.(png|jpe?g|webp|gif|svg)(\?|#|$)/.test(lower)) return true
  // Query-param hints such as ?image=... / &qr=... / ?qrcode=...
  if (/[?&](image|qr|qrcode)=/.test(lower)) return true
  return false
}

interface PaymentConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  topupAmount: number
  paymentAmount: number
  paymentMethod: PaymentMethod | undefined
  calculating: boolean
  processing: boolean
  discountRate?: number
  usdExchangeRate?: number
  /** When set, the dialog switches to the in-place scan-to-pay view. */
  qrPayment?: EpayPaymentDetail | null
  /** Called when polling detects the order has been paid. */
  onPaid?: () => void
}

export function PaymentConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  topupAmount,
  paymentAmount,
  paymentMethod,
  calculating,
  processing,
  discountRate = DEFAULT_DISCOUNT_RATE,
  usdExchangeRate = 1,
  qrPayment,
  onPaid,
}: PaymentConfirmDialogProps) {
  const { t } = useTranslation()
  const hasDiscount = discountRate > 0 && discountRate < 1 && paymentAmount > 0
  const originalAmount = hasDiscount ? paymentAmount / discountRate : 0
  const discountAmount = hasDiscount ? originalAmount - paymentAmount : 0

  const isQrMode = !!qrPayment

  // status: pending | success | expired (server-reported)
  const [pollStatus, setPollStatus] = useState<string>('pending')
  const [checking, setChecking] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  // Poll order status while the QR view is open.
  useEffect(() => {
    if (!open || !qrPayment?.trade_no) return

    const tradeNo = qrPayment.trade_no
    let cancelled = false
    const deadline = Date.now() + POLL_TIMEOUT_MS
    setPollStatus('pending')
    setTimedOut(false)

    const tick = async () => {
      if (cancelled) return
      try {
        const res = await getTopUpStatus(tradeNo)
        if (cancelled) return
        const st = res?.data?.status
        if (isApiSuccess(res) && st) {
          setPollStatus(st)
          if (st === 'success') {
            cancelled = true
            window.clearInterval(id)
            onPaid?.()
            return
          }
          if (st === 'expired') {
            cancelled = true
            window.clearInterval(id)
            return
          }
        }
      } catch {
        // Transient error — keep polling.
      }
      if (!cancelled && Date.now() > deadline) {
        cancelled = true
        window.clearInterval(id)
        setTimedOut(true)
      }
    }

    const id = window.setInterval(tick, POLL_INTERVAL_MS)
    // Kick off an immediate check so the user gets fast feedback.
    void tick()

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [open, qrPayment?.trade_no, onPaid])

  const handleManualCheck = useCallback(async () => {
    if (!qrPayment?.trade_no) return
    setChecking(true)
    try {
      const res = await getTopUpStatus(qrPayment.trade_no)
      const st = res?.data?.status
      if (isApiSuccess(res) && st) {
        setPollStatus(st)
        if (st === 'success') onPaid?.()
      }
    } catch {
      // ignore
    } finally {
      setChecking(false)
    }
  }, [qrPayment?.trade_no, onPaid])

  const handleOpenPaymentPage = useCallback(() => {
    if (!qrPayment) return
    // Prefer POSTing the form to the gateway: many epay gateways only generate
    // the QR / payment page on POST. pay_url is just a GET-built fallback.
    if (qrPayment.form_url && qrPayment.form_params) {
      submitPaymentForm(qrPayment.form_url, qrPayment.form_params)
    } else if (qrPayment.pay_url) {
      window.open(qrPayment.pay_url, '_blank')
    }
  }, [qrPayment])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'>
        {isQrMode ? (
          <ScanToPayView
            qrPayment={qrPayment as EpayPaymentDetail}
            paymentMethod={paymentMethod}
            paymentAmount={paymentAmount}
            pollStatus={pollStatus}
            timedOut={timedOut}
            checking={checking}
            onManualCheck={handleManualCheck}
            onOpenPaymentPage={handleOpenPaymentPage}
          />
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className='text-xl font-semibold'>
                {t('Confirm Payment')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('Review your payment details')}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className='space-y-3 py-3 sm:space-y-4 sm:py-4'>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground text-sm'>
                  {t('Topup Amount')}
                </span>
                <span className='text-lg font-semibold'>
                  {formatLocalCurrencyAmount(topupAmount * usdExchangeRate, {
                    digitsLarge: 2,
                    digitsSmall: 2,
                    abbreviate: false,
                  })}
                </span>
              </div>

              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground text-sm'>
                  {t('You Pay')}
                </span>
                {calculating ? (
                  <Skeleton className='h-6 w-24' />
                ) : (
                  <div className='flex items-baseline gap-2'>
                    <span className='text-2xl font-semibold'>
                      {formatCurrency(paymentAmount)}
                    </span>
                    {hasDiscount && (
                      <span className='text-muted-foreground text-sm line-through'>
                        {formatCurrency(originalAmount)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {hasDiscount && !calculating && (
                <div className='bg-muted/50 rounded-lg p-3'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-muted-foreground'>
                      {t('You save')}
                    </span>
                    <span className='font-semibold text-green-600'>
                      {formatCurrency(discountAmount)}
                    </span>
                  </div>
                </div>
              )}

              <div className='border-t pt-4'>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground text-sm'>
                    {t('Payment Method')}
                  </span>
                  <div className='flex items-center gap-2'>
                    {getPaymentIcon(
                      paymentMethod?.type,
                      'h-4 w-4',
                      paymentMethod?.icon,
                      paymentMethod?.name
                    )}
                    <span className='font-medium'>{paymentMethod?.name}</span>
                  </div>
                </div>
              </div>
            </div>

            <AlertDialogFooter className='grid grid-cols-2 gap-2 sm:flex'>
              <AlertDialogCancel disabled={processing}>
                {t('Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm} disabled={processing}>
                {processing && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                {t('Confirm Payment')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface ScanToPayViewProps {
  qrPayment: EpayPaymentDetail
  paymentMethod: PaymentMethod | undefined
  paymentAmount: number
  pollStatus: string
  timedOut: boolean
  checking: boolean
  onManualCheck: () => void
  onOpenPaymentPage: () => void
}

function ScanToPayView({
  qrPayment,
  paymentMethod,
  paymentAmount,
  pollStatus,
  timedOut,
  checking,
  onManualCheck,
  onOpenPaymentPage,
}: ScanToPayViewProps) {
  const { t } = useTranslation()
  const qrValue = qrPayment.qr_url || ''
  const renderAsImage = isLikelyImageUrl(qrValue)
  let qrContent: ReactNode = <Skeleton className='h-44 w-44 sm:h-48 sm:w-48' />
  if (qrValue && renderAsImage) {
    qrContent = (
      <img
        src={qrValue}
        alt={t('Payment QR code')}
        className='h-44 w-44 object-contain sm:h-48 sm:w-48'
      />
    )
  } else if (qrValue) {
    qrContent = <QRCodeSVG value={qrValue} size={192} level='M' />
  }

  let statusContent: ReactNode
  if (pollStatus === 'success') {
    statusContent = (
      <div className='flex items-center gap-2 text-sm font-medium text-green-600'>
        <CheckCircle2 className='h-4 w-4' />
        {t('Payment successful')}
      </div>
    )
  } else if (pollStatus === 'expired') {
    statusContent = (
      <div className='text-destructive text-sm font-medium'>
        {t('This order has expired, please try again')}
      </div>
    )
  } else if (timedOut) {
    statusContent = (
      <div className='text-muted-foreground text-center text-sm'>
        {t('Status check timed out. If you have already paid, please refresh.')}
      </div>
    )
  } else {
    statusContent = (
      <div className='text-muted-foreground flex items-center gap-2 text-sm'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {t('Waiting for payment...')}
      </div>
    )
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className='text-xl font-semibold'>
          {t('Scan to Pay')}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t('Scan the QR code with your payment app to complete the payment')}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className='flex flex-col items-center gap-3 py-3 sm:py-4'>
        <div className='rounded-xl border bg-white p-3 shadow-sm'>
          {qrContent}
        </div>

        {/* Live status hint */}
        {statusContent}
      </div>

      {/* Order summary */}
      <div className='space-y-2 border-t pt-3 text-sm'>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground'>{t('Amount')}</span>
          <span className='font-semibold'>{formatCurrency(paymentAmount)}</span>
        </div>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground'>{t('Payment Method')}</span>
          <div className='flex items-center gap-2'>
            {getPaymentIcon(
              paymentMethod?.type,
              'h-4 w-4',
              paymentMethod?.icon,
              paymentMethod?.name
            )}
            <span className='font-medium'>
              {paymentMethod?.name || qrPayment.payment_method}
            </span>
          </div>
        </div>
        {qrPayment.trade_no && (
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground shrink-0'>
              {t('Order No.')}
            </span>
            <span className='truncate font-mono text-xs'>
              {qrPayment.trade_no}
            </span>
          </div>
        )}
      </div>

      <AlertDialogFooter className='flex flex-col gap-2 sm:flex-col'>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <Button variant='outline' onClick={onOpenPaymentPage}>
            <ExternalLink className='mr-1 h-4 w-4' />
            {t('Open payment page')}
          </Button>
          <Button variant='outline' onClick={onManualCheck} disabled={checking}>
            {checking ? (
              <Loader2 className='mr-1 h-4 w-4 animate-spin' />
            ) : (
              <RefreshCw className='mr-1 h-4 w-4' />
            )}
            {t('Check payment status')}
          </Button>
        </div>
        <AlertDialogCancel className='mt-0 w-full'>
          {t('Cancel')}
        </AlertDialogCancel>
      </AlertDialogFooter>
    </>
  )
}
