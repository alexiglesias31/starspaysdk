/** Subscription state machine types */

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'expired'
  | 'revoked';

/** States where the user has access to the product */
export const ENTITLED_STATUSES: SubscriptionStatus[] = [
  'active',
  'canceled',
  'past_due',
];

export interface Subscription {
  id: string;
  app_id: string;
  customer_id: string;
  telegram_user_id: number;
  product_id: string;
  price_id: string;
  status: SubscriptionStatus;
  /** Stars amount per period */
  amount: number;
  /** Telegram's charge ID - needed for refunds and editUserStarSubscription */
  telegram_payment_charge_id: string | null;
  /** Provider's charge ID */
  provider_payment_charge_id: string | null;
  /** Invoice payload used to identify this subscription */
  invoice_payload: string;
  /** Current period start (Unix timestamp) */
  current_period_start: number | null;
  /** Current period end (Unix timestamp) */
  current_period_end: number | null;
  /** Whether user has canceled auto-renewal */
  cancel_at_period_end: boolean;
  /** Timestamp when cancellation was requested */
  canceled_at: number | null;
  /** App-defined grace period in seconds (default: 3 days) */
  grace_period_seconds: number;
  /** When the subscription was created */
  created_at: string;
  /** When the subscription was last updated */
  updated_at: string;
}

export interface SubscriptionEvent {
  type: SubscriptionEventType;
  subscription: Subscription;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type SubscriptionEventType =
  | 'subscription.created'
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.canceled'
  | 'subscription.past_due'
  | 'subscription.expired'
  | 'subscription.revoked'
  | 'subscription.reactivated';

/** Valid state transitions */
export const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  pending: ['active', 'expired'],
  active: ['active', 'canceled', 'past_due', 'revoked'],
  canceled: ['active', 'expired'],
  past_due: ['active', 'expired'],
  expired: ['active'],
  revoked: ['canceled'],
};
