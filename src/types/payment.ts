/** Payment and transaction types */

export type PaymentType = 'one_time' | 'subscription_initial' | 'subscription_renewal';

export interface Payment {
  id: string;
  app_id: string;
  customer_id: string;
  telegram_user_id: number;
  subscription_id: string | null;
  type: PaymentType;
  /** Stars amount */
  amount: number;
  currency: 'XTR';
  status: 'succeeded' | 'refunded';
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
  invoice_payload: string;
  /** Estimated USD value at time of payment */
  estimated_usd: number | null;
  created_at: string;
}

export interface Product {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  type: 'one_time' | 'subscription';
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Price {
  id: string;
  product_id: string;
  app_id: string;
  /** Amount in Stars */
  amount: number;
  currency: 'XTR';
  /** Subscription period in seconds (2592000 for monthly) */
  period: number | null;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

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
