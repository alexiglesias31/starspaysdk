/** Payment and transaction types */

import type { PaymentProvider } from '../server/providers/types.js';
export type { PaymentProvider };

export type PaymentType = 'one_time' | 'subscription_initial' | 'subscription_renewal';

export interface Payment {
  id: string;
  app_id: string;
  customer_id: string;
  telegram_user_id: number;
  subscription_id: string | null;
  type: PaymentType;
  /** Payment amount (in the relevant currency's smallest unit) */
  amount: number;
  currency: string;
  status: 'succeeded' | 'refunded';
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
  invoice_payload: string;
  /** Estimated USD value at time of payment */
  estimated_usd: number | null;
  created_at: string;
  /** Payment provider that processed this transaction */
  provider?: PaymentProvider;
}

export interface Product {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  type: 'one_time' | 'subscription';
  /** Linked channel chat ID for channel membership subscriptions (null for regular products) */
  channel_chat_id: number | null;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Price {
  id: string;
  product_id: string;
  app_id: string;
  /** Amount in the relevant currency's smallest unit */
  amount: number;
  currency: string;
  /** Subscription period in seconds (2592000 for monthly) */
  period: number | null;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  /** Payment provider for this price */
  provider?: PaymentProvider;
}

/** Parameters for creating a new product (server-assigned fields excluded) */
export type CreateProductParams = Pick<Product, 'name' | 'type'> & Partial<Pick<Product, 'description' | 'active' | 'metadata' | 'channel_chat_id'>>;

/** Parameters for creating a new price (server-assigned fields excluded) */
export type CreatePriceParams = Pick<Price, 'product_id' | 'amount'> & Partial<Pick<Price, 'period' | 'active' | 'metadata'>>;

export interface Customer {
  id: string;
  app_id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  telegram_language_code: string | null;
  is_premium: boolean;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Record<string, unknown>;
}

export interface WebhookEvent {
  id: string;
  app_id: string;
  event_type: string;
  telegram_update_id: number;
  payload: Record<string, unknown>;
  processed: boolean;
  processing_error: string | null;
  created_at: string;
}
