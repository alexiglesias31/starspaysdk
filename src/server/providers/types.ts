/** Identifies which payment provider handled a transaction */
export type PaymentProvider =
  | 'stars'              // Telegram Stars (XTR)
  | 'telegram_payments'  // Telegram Payments API (Stripe, Redsys, YooKassa, etc. — gateway configured in @BotFather)

/** Normalized result from any provider's invoice creation */
export interface ProviderInvoiceResult {
  providerInvoiceId: string
  payUrl: string
  provider: PaymentProvider
  raw?: unknown
}

/** Normalized payment event from any webhook source */
export interface ProviderPaymentEvent {
  provider: PaymentProvider
  providerPaymentId: string
  invoicePayload: string
  telegramUserId: number
  amount: number
  currency: string
  metadata?: Record<string, unknown>
}

/** Provider-specific refund result */
export interface ProviderRefundResult {
  success: boolean
  refundId?: string
  provider: PaymentProvider
}
