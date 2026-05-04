import type {
  SubscriptionStatus,
  Subscription,
  SubscriptionEventType,
} from '../types/subscription.js';
import { VALID_TRANSITIONS } from '../types/subscription.js';
import { DEFAULT_GRACE_PERIOD_SECONDS, SUBSCRIPTION_PERIOD_SECONDS } from '../types/config.js';
import type { SuccessfulPayment } from '../types/telegram.js';

function assertValidTelegramId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid Telegram user ID: must be a positive integer');
  }
}

/**
 * A subscription grants access when it is active, canceled with time remaining,
 * or past_due AND the merchant's product policy retains access during grace
 * (default true). A past_due sub whose `retain_access_during_grace` snapshot is
 * `false` does NOT grant access.
 */
function isEntitled(sub: Subscription): boolean {
  if (sub.status === 'active' || sub.status === 'canceled') return true;
  if (sub.status === 'past_due') return sub.retain_access_during_grace !== false;
  return false;
}

/**
 * Storage interface for subscription data.
 *
 * IMPORTANT: Implementations MUST enforce a unique constraint on
 * (app_id, telegram_payment_charge_id) to prevent duplicate subscriptions
 * from concurrent webhook deliveries. The SubscriptionManager relies on
 * this constraint for idempotency — without it, race conditions can
 * create duplicate subscription records.
 */
export interface SubscriptionStore {
  getByPayload(appId: string, invoicePayload: string, telegramUserId: number): Promise<Subscription | null>;
  getByUserId(appId: string, telegramUserId: number): Promise<Subscription[]>;
  getById(id: string): Promise<Subscription | null>;
  /** Look up a subscription by its Telegram charge ID for idempotency checks */
  getByChargeId(appId: string, telegramPaymentChargeId: string): Promise<Subscription | null>;
  create(subscription: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>): Promise<Subscription>;
  /**
   * Update a subscription. When `_expectedStatus` is included in the data,
   * implementations MUST verify the current status matches before applying
   * the update and throw if it doesn't (optimistic concurrency control).
   */
  update(id: string, fields: Partial<Subscription> & { _expectedStatus?: SubscriptionStatus }): Promise<Subscription>;
  /** Returns active AND canceled subscriptions past their period end */
  getExpiredActive(now: number): Promise<Subscription[]>;
  getPastDueExpired(now: number): Promise<Subscription[]>;
}

export interface SubscriptionManagerConfig {
  appId: string;
  store: SubscriptionStore;
  gracePeriodSeconds?: number;
  onEvent?: (event: SubscriptionEventType, subscription: Subscription) => void | Promise<void>;
  /** Called when a non-fatal error occurs during background jobs such as checkExpiredSubscriptions. Defaults to console.error. */
  onError?: (err: unknown, context: string) => void;
  /** Maximum subscriptions to process per checkExpiredSubscriptions run. Defaults to 500. */
  maxBatchSize?: number;
}

/**
 * Manages subscription lifecycle using the 6-state machine.
 *
 * States: pending → active → canceled → past_due → expired → revoked
 * See ADR-4 for full state transition diagram.
 */
export class SubscriptionManager {
  private readonly appId: string;
  private readonly store: SubscriptionStore;
  private readonly gracePeriod: number;
  private readonly onEvent?: (event: SubscriptionEventType, subscription: Subscription) => void | Promise<void>;
  private readonly onError: (err: unknown, context: string) => void;
  private readonly maxBatchSize: number;

  constructor(config: SubscriptionManagerConfig) {
    this.appId = config.appId;
    this.store = config.store;
    this.gracePeriod = config.gracePeriodSeconds ?? DEFAULT_GRACE_PERIOD_SECONDS;
    this.onEvent = config.onEvent;
    this.onError = config.onError ?? ((err, context) => console.error(`[StarsPay] ${context}:`, err));
    this.maxBatchSize = config.maxBatchSize ?? 500;
  }

  /**
   * Check if a user has an active entitlement (active, canceled with time remaining, or in grace period).
   * A `past_due` subscription denies entitlement when its `retain_access_during_grace` snapshot is `false`.
   */
  async isActive(telegramUserId: number): Promise<boolean> {
    assertValidTelegramId(telegramUserId);
    const subscriptions = await this.store.getByUserId(this.appId, telegramUserId);
    return subscriptions.some(isEntitled);
  }

  /**
   * Get all subscriptions for a user.
   */
  async getSubscriptions(telegramUserId: number): Promise<Subscription[]> {
    assertValidTelegramId(telegramUserId);
    return this.store.getByUserId(this.appId, telegramUserId);
  }

  /**
   * Get the active subscription for a user (first entitled subscription found).
   */
  async getActiveSubscription(telegramUserId: number): Promise<Subscription | null> {
    assertValidTelegramId(telegramUserId);
    const subscriptions = await this.store.getByUserId(this.appId, telegramUserId);
    return subscriptions.find(isEntitled) ?? null;
  }

  /**
   * Handle a successful payment event - creates or renews a subscription.
   *
   * @param payment - The successful payment data from Telegram.
   * @param telegramUserId - The Telegram user ID of the payer.
   * @param productId - The product ID being purchased.
   * @param priceId - The price ID being purchased.
   * @param customerId - Optional customer ID from your own system. When omitted, a synthetic
   *   ID is derived from the Telegram user ID for local-only use. This synthetic ID
   *   (`cust_<telegramUserId>`) is not stable across different StarsPay deployments and
   *   should be replaced with a real customer ID when one is available.
   */
  async handleSuccessfulPayment(
    payment: SuccessfulPayment,
    telegramUserId: number,
    productId: string,
    priceId: string,
    customerId?: string
  ): Promise<Subscription> {
    assertValidTelegramId(telegramUserId);
    // Idempotency guard: if this charge ID has already been processed, return it immediately
    const byChargeId = await this.store.getByChargeId(this.appId, payment.telegram_payment_charge_id);
    if (byChargeId) {
      return byChargeId;
    }

    const existing = await this.store.getByPayload(this.appId, payment.invoice_payload, telegramUserId);

    // M1: Compute period end with 30-day fallback for subscriptions when Telegram doesn't provide one
    const isSubscription = payment.is_recurring || payment.is_first_recurring;
    const periodEnd = payment.subscription_expiration_date
      ?? (isSubscription
        ? Math.max(existing?.current_period_end ?? 0, Math.floor(Date.now() / 1000)) + SUBSCRIPTION_PERIOD_SECONDS
        : null);

    if (!existing) {
      // New subscription (first payment)
      // Use provided customerId if available; fall back to synthetic ID for local-only use
      const resolvedCustomerId = customerId ?? `cust_${telegramUserId}`;
      try {
        const sub = await this.store.create({
          app_id: this.appId,
          customer_id: resolvedCustomerId,
          telegram_user_id: telegramUserId,
          product_id: productId,
          price_id: priceId,
          status: 'active',
          amount: payment.total_amount,
          telegram_payment_charge_id: payment.telegram_payment_charge_id,
          provider_payment_charge_id: payment.provider_payment_charge_id,
          invoice_payload: payment.invoice_payload,
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          canceled_at: null,
          grace_period_seconds: this.gracePeriod,
        });
        await this.emit('subscription.created', sub);
        return sub;
      } catch (err) {
        // Handle race condition: another request created the subscription first
        const existing = await this.store.getByChargeId(this.appId, payment.telegram_payment_charge_id);
        if (existing) return existing;
        throw err;
      }
    }

    // Renewal idempotency: if the existing subscription already has this charge ID,
    // this is a duplicate webhook — return it without re-processing
    if (existing.telegram_payment_charge_id === payment.telegram_payment_charge_id) {
      return existing;
    }

    // Handle edge case: renewal payment for a revoked subscription
    // (Telegram may send a renewal after the bot already refunded/revoked)
    if (existing.status === 'revoked') {
      this.onError(
        new Error(`Received renewal payment for revoked subscription ${existing.id} (charge: ${payment.telegram_payment_charge_id})`),
        'Renewal payment for revoked subscription — ignoring'
      );
      return existing;
    }

    // Renewal - extend subscription
    const updated = await this.transition(existing.id, 'active', {
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      provider_payment_charge_id: payment.provider_payment_charge_id,
      current_period_start: existing.current_period_end ?? Math.floor(Date.now() / 1000),
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      canceled_at: null,
    });
    await this.emit('subscription.renewed', updated);
    return updated;
  }

  /**
   * Handle user cancellation (disables auto-renewal, access continues until period end).
   */
  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    if (typeof subscriptionId !== 'string' || subscriptionId.trim().length === 0) {
      throw new Error('Invalid subscription ID: must be a non-empty string');
    }
    const updated = await this.transition(subscriptionId, 'canceled', {
      cancel_at_period_end: true,
      canceled_at: Math.floor(Date.now() / 1000),
    });
    await this.emit('subscription.canceled', updated);
    return updated;
  }

  /**
   * Handle bot-initiated revocation.
   */
  async revokeSubscription(subscriptionId: string): Promise<Subscription> {
    if (typeof subscriptionId !== 'string' || subscriptionId.trim().length === 0) {
      throw new Error('Invalid subscription ID: must be a non-empty string');
    }
    const updated = await this.transition(subscriptionId, 'revoked');
    await this.emit('subscription.revoked', updated);
    return updated;
  }

  /**
   * Re-enable a previously canceled subscription.
   *
   * Expired subscriptions cannot be reactivated without a new payment unless
   * an explicit admin override reason is provided.
   *
   * @param subscriptionId - The subscription to reactivate.
   * @param reason - Required when the subscription is expired. Use `'admin_override'` only when
   *   manually restoring access (e.g., support action). Use `'payment_received'` when the
   *   reactivation is triggered by a successful payment outside the normal webhook path.
   */
  async reactivateSubscription(
    subscriptionId: string,
    reason?: 'admin_override' | 'payment_received'
  ): Promise<Subscription> {
    if (typeof subscriptionId !== 'string' || subscriptionId.trim().length === 0) {
      throw new Error('Invalid subscription ID: must be a non-empty string');
    }
    const sub = await this.store.getById(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

    if (sub.status === 'revoked') {
      throw new Error('Cannot reactivate a revoked subscription');
    }

    if (sub.status === 'expired') {
      if (reason !== 'admin_override') {
        throw new Error(
          'Cannot reactivate an expired subscription without a new payment or explicit admin override. ' +
          'Pass reason: "admin_override" to force reactivation, or process a new payment instead.'
        );
      }
    }

    if (sub.status === 'canceled') {
      const now = Math.floor(Date.now() / 1000);
      if (sub.current_period_end && now > sub.current_period_end && reason !== 'admin_override') {
        throw new Error(
          'Cannot reactivate a canceled subscription after period end without admin override'
        );
      }
    }

    if (sub.status === 'canceled' || sub.status === 'expired' || sub.status === 'past_due') {
      const now = Math.floor(Date.now() / 1000);
      const updated = await this.transition(subscriptionId, 'active', {
        cancel_at_period_end: false,
        canceled_at: null,
        current_period_start: now,
        current_period_end: now + SUBSCRIPTION_PERIOD_SECONDS,
      });
      await this.emit('subscription.reactivated', updated);
      return updated;
    }

    throw new Error(`Cannot reactivate subscription in status: ${sub.status}`);
  }

  /**
   * Run periodic check for expired subscriptions.
   * Should be called by a cron job every 5-15 minutes.
   */
  async checkExpiredSubscriptions(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Active subscriptions past their period end → past_due
    const expiredActive = (await this.store.getExpiredActive(now)).slice(0, this.maxBatchSize);
    for (const sub of expiredActive) {
      try {
        // Re-read to guard against concurrent updates between batch fetch and transition
        const current = await this.store.getById(sub.id);
        if (!current || current.status !== sub.status || (current.current_period_end !== null && current.current_period_end > now)) continue;

        if (current.status === 'canceled') {
          // Canceled subscriptions past their period end go directly to expired
          const updated = await this.transition(current.id, 'expired');
          await this.emit('subscription.expired', updated);
        } else {
          const updated = await this.transition(current.id, 'past_due');
          await this.emit('subscription.past_due', updated);
        }
      } catch (err) {
        this.onError(err, `Failed to transition subscription ${sub.id}`);
      }
    }

    // Past_due subscriptions past their grace period → expired
    const pastDueExpired = (await this.store.getPastDueExpired(now)).slice(0, this.maxBatchSize);
    for (const sub of pastDueExpired) {
      try {
        // Re-read to guard against concurrent updates between batch fetch and transition
        const current = await this.store.getById(sub.id);
        if (!current || current.status !== sub.status) continue;

        const updated = await this.transition(current.id, 'expired');
        await this.emit('subscription.expired', updated);
      } catch (err) {
        this.onError(err, `Failed to transition subscription ${sub.id} to expired`);
      }
    }
  }

  private async transition(
    subscriptionId: string,
    newStatus: SubscriptionStatus,
    additionalFields?: Partial<Subscription>
  ): Promise<Subscription> {
    const sub = await this.store.getById(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

    const allowed = VALID_TRANSITIONS[sub.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${sub.status} → ${newStatus} (allowed: ${allowed.join(', ')})`
      );
    }

    return this.store.update(subscriptionId, {
      status: newStatus,
      _expectedStatus: sub.status,
      ...additionalFields,
    });
  }

  private async emit(event: SubscriptionEventType, subscription: Subscription): Promise<void> {
    if (this.onEvent) {
      try {
        await this.onEvent(event, subscription);
      } catch (err) {
        this.onError(err, `onEvent handler error for ${event}`);
      }
    }
  }
}
