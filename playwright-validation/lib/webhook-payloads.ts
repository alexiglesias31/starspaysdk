/**
 * Helpers that synthesize the Telegram webhook payloads the SDK middleware
 * expects to receive from Telegram. The SDK only inspects shape — these
 * payloads do not need real signatures (the secret-token header is the
 * authentication mechanism, validated separately by the middleware).
 */

import { createHmac } from 'node:crypto';

export interface SuccessfulPaymentArgs {
  userId: number;
  amount: number;
  currency: string;
  payload: string;
  chargeId: string;
  isRecurring?: boolean;
  isFirstRecurring?: boolean;
  subscriptionExpirationDate?: number;
}

export function makeSuccessfulPaymentUpdate(args: SuccessfulPaymentArgs) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      from: { id: args.userId, first_name: 'Test', is_bot: false },
      chat: { id: args.userId, type: 'private' as const },
      successful_payment: {
        currency: args.currency,
        total_amount: args.amount,
        invoice_payload: args.payload,
        telegram_payment_charge_id: args.chargeId,
        provider_payment_charge_id: `prov_${args.chargeId}`,
        is_recurring: args.isRecurring ?? false,
        is_first_recurring: args.isFirstRecurring ?? false,
        subscription_expiration_date: args.subscriptionExpirationDate,
      },
    },
  };
}

export interface PreCheckoutArgs {
  userId: number;
  amount: number;
  currency: string;
  payload: string;
  isRecurring?: boolean;
  isFirstRecurring?: boolean;
}

export function makePreCheckoutQueryUpdate(args: PreCheckoutArgs) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    pre_checkout_query: {
      id: `pcq_${Date.now()}`,
      from: { id: args.userId, first_name: 'Test', is_bot: false },
      currency: args.currency,
      total_amount: args.amount,
      invoice_payload: args.payload,
      is_recurring: args.isRecurring ?? false,
      is_first_recurring: args.isFirstRecurring ?? false,
    },
  };
}

export interface RefundedPaymentArgs {
  userId: number;
  amount: number;
  payload: string;
  chargeId: string;
}

export function makeRefundedPaymentUpdate(args: RefundedPaymentArgs) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: 2,
      date: Math.floor(Date.now() / 1000),
      from: { id: args.userId, first_name: 'Test', is_bot: false },
      chat: { id: args.userId, type: 'private' as const },
      refunded_payment: {
        currency: 'XTR',
        total_amount: args.amount,
        invoice_payload: args.payload,
        telegram_payment_charge_id: args.chargeId,
        provider_payment_charge_id: `prov_${args.chargeId}`,
      },
    },
  };
}

/**
 * Build a real, valid initData string for a given bot token. The SDK
 * validates this with HMAC-SHA256 — the function mirrors Telegram's
 * derivation algorithm.
 */
export function makeInitDataString(botToken: string, params: Record<string, string>): string {
  const fullParams = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...params,
  };
  const dataCheckString = Object.entries(fullParams)
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const url = new URLSearchParams(fullParams);
  url.set('hash', hash);
  return url.toString();
}
