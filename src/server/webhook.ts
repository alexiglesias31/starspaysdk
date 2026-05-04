import type {
  TelegramUpdate,
  PreCheckoutQuery,
  SuccessfulPayment,
  RefundedPayment,
  ShippingQuery,
} from '../types/telegram.js';
import type { PaymentType } from '../types/payment.js';

export type WebhookEventType =
  | 'pre_checkout'
  | 'shipping_query'
  | 'payment.one_time'
  | 'payment.subscription_initial'
  | 'payment.subscription_renewal'
  | 'payment.refunded'
  | 'unknown';

export interface ParsedWebhookEvent {
  type: WebhookEventType;
  paymentType: PaymentType | null;
  update: TelegramUpdate;
  preCheckoutQuery: PreCheckoutQuery | null;
  successfulPayment: SuccessfulPayment | null;
  refundedPayment: RefundedPayment | null;
  shippingQuery: ShippingQuery | null;
  telegramUserId: number | null;
}

/**
 * Parse a raw Telegram update and classify the payment event type.
 */
export function parseWebhookUpdate(update: TelegramUpdate): ParsedWebhookEvent {
  // Pre-checkout query
  if (update.pre_checkout_query) {
    return {
      type: 'pre_checkout',
      paymentType: null,
      update,
      preCheckoutQuery: update.pre_checkout_query,
      successfulPayment: null,
      refundedPayment: null,
      shippingQuery: null,
      telegramUserId: update.pre_checkout_query.from.id,
    };
  }

  // Shipping query
  if (update.shipping_query) {
    return {
      type: 'shipping_query',
      paymentType: null,
      update,
      preCheckoutQuery: null,
      successfulPayment: null,
      refundedPayment: null,
      shippingQuery: update.shipping_query,
      telegramUserId: update.shipping_query.from.id,
    };
  }

  // Successful payment
  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    const paymentType = classifyPaymentType(payment);
    const userId = update.message.from?.id;

    return {
      type: `payment.${paymentType}` as WebhookEventType,
      paymentType,
      update,
      preCheckoutQuery: null,
      successfulPayment: payment,
      refundedPayment: null,
      shippingQuery: null,
      telegramUserId: (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) ? userId : null,
    };
  }

  // Refunded payment
  if (update.message?.refunded_payment) {
    const userId = update.message.from?.id;
    return {
      type: 'payment.refunded',
      paymentType: null,
      update,
      preCheckoutQuery: null,
      successfulPayment: null,
      refundedPayment: update.message.refunded_payment,
      shippingQuery: null,
      telegramUserId: (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) ? userId : null,
    };
  }

  return {
    type: 'unknown',
    paymentType: null,
    update,
    preCheckoutQuery: null,
    successfulPayment: null,
    refundedPayment: null,
    shippingQuery: null,
    telegramUserId: null,
  };
}

/**
 * Classify a successful payment as one-time, initial subscription, or renewal.
 */
function classifyPaymentType(payment: SuccessfulPayment): PaymentType {
  if (payment.is_recurring && payment.is_first_recurring) {
    return 'subscription_initial';
  }
  if (payment.is_recurring) {
    return 'subscription_renewal';
  }
  // Defensive: if Telegram sends is_first_recurring without is_recurring, treat as subscription_initial
  if (payment.is_first_recurring && !payment.is_recurring) {
    console.warn('[starspay] WARNING: is_first_recurring=true but is_recurring=false — treating as subscription_initial');
    return 'subscription_initial';
  }
  return 'one_time';
}

/**
 * Check if a Telegram update is a payment-related event that StarsPay should handle.
 */
export function isPaymentUpdate(update: TelegramUpdate): boolean {
  return !!(
    update.pre_checkout_query ||
    update.shipping_query ||
    update.message?.successful_payment ||
    update.message?.refunded_payment
  );
}
