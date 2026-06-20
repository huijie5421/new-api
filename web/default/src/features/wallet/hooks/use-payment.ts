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
import { useState, useCallback } from 'react'
import i18next from 'i18next'
import { toast } from 'sonner'
import {
  calculateAmount,
  calculateStripeAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestStripePayment,
  isApiSuccess,
} from '../api'
import {
  isStripePayment,
  isWaffoPancakePayment,
  submitPaymentForm,
} from '../lib'
import type {
  EpayPaymentDetail,
  PaymentResponse,
  ProcessPaymentResult,
} from '../types'

// ============================================================================
// Payment Hook
// ============================================================================

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setCalculating(true)

        const isStripe = isStripePayment(paymentType)
        const isPancake = isWaffoPancakePayment(paymentType)
        const response = isStripe
          ? await calculateStripeAmount({ amount: topupAmount })
          : isPancake
            ? await calculateWaffoPancakeAmount({ amount: topupAmount })
            : await calculateAmount({ amount: topupAmount })

        if (isApiSuccess(response) && response.data) {
          const calculatedAmount = parseFloat(response.data)
          setAmount(calculatedAmount)
          return calculatedAmount
        }

        // Don't show error for calculation, just set to 0
        setAmount(0)
        return 0
      } catch (_error) {
        setAmount(0)
        return 0
      } finally {
        setCalculating(false)
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (
      topupAmount: number,
      paymentType: string
    ): Promise<ProcessPaymentResult> => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const amount = Math.floor(topupAmount)

        const response = isStripe
          ? await requestStripePayment({
              amount,
              payment_method: 'stripe',
            })
          : await requestPayment({
              amount,
              payment_method: paymentType,
            })

        if (!isApiSuccess(response)) {
          toast.error(response.message || i18next.t('Payment request failed'))
          return { kind: 'failed' }
        }

        // Handle Stripe payment — always external checkout.
        if (isStripe) {
          if (response.data?.pay_link) {
            window.open(response.data.pay_link as string, '_blank')
            toast.success(i18next.t('Redirecting to payment page...'))
            return { kind: 'external_opened' }
          }
          return { kind: 'failed' }
        }

        // Handle epay payment.
        const payResp = response as PaymentResponse
        const payment = payResp.payment
        const qrUrl = payment?.qr_url || payResp.qr_url

        // Prefer the in-dialog scan-to-pay experience when a QR / payment link
        // was parsed server-side.
        if (qrUrl) {
          const detail: EpayPaymentDetail = {
            trade_no: payment?.trade_no || payResp.trade_no || '',
            pay_url: payment?.pay_url || payResp.pay_url,
            form_url: payment?.form_url || payResp.url,
            form_params:
              payment?.form_params ||
              (payResp.data as Record<string, unknown> | undefined),
            qr_url: qrUrl,
            payment_method: payment?.payment_method || paymentType,
            amount: payment?.amount,
            money: payment?.money,
          }
          return { kind: 'qr', payment: detail }
        }

        // Fallback: legacy behavior — submit the form to open the payment page.
        const url = payResp.url
        if (url && payResp.data) {
          submitPaymentForm(url, payResp.data)
          toast.success(i18next.t('Redirecting to payment page...'))
          return { kind: 'external_opened' }
        }

        return { kind: 'failed' }
      } catch (_error) {
        toast.error(i18next.t('Payment request failed'))
        return { kind: 'failed' }
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    amount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
  }
}
