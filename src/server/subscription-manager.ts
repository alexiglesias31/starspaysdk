import type {
  SubscriptionStatus,
  Subscription,
  SubscriptionEventType,
} from '../types/subscription.js';
import { VALID_TRANSITIONS, ENTITLED_STATUSES } from '../types/subscription.js';
import { DEFAULT_GRACE_PERIOD_SECONDS } from '../types/config.js';
import type { SuccessfulPayment } from '../types/telegram.js';

export interface SubscriptionStore {
  getByPayload(appId: string, invoicePayload: string): Promise<Subscription | null>;
  getByUserId(appId: string, telegramUserId: number): Promise<Subscription[]>;
  getById(id: string): Promise<Subscription | null>;
  create(subscription: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>): Promise<Subscription>;
  update(id: string, fields: Partial<Subscription>): Promise<Subscription>;
  getExpiredActive(now: number): Promise<Subscription[]>;
  getPastDueExpired(now: number): Promise<Subscription[]>;
}

export interface SubscriptionManagerConfig {
  appId: string;
  store: SubscriptionStore;
  gracePeriodSeconds?: number;
  onEvent?: (event: SubscriptionEventType, subscription: Subscription) => void | Promise<void>;
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

  constructor(config: SubscriptionManagerConfig) {
    this.appId = config.appId;
    this.store = config.store;
    this.gracePeriod = config.gracePeriodSeconds ?? DEFAULT_GRACE_PERIOD_SECONDS;
    this.onEvent = config.onEvent;
  }

  /**
   * Check if a user has an active entitlement (active, canceled with time remaining, or in grace period).
   */
  async isActive(telegramUserId: number): Promise<boolean> {
    const subscriptions = await this.store.getByUserId(this.appId, telegramUserId);
    return subscriptions.some((sub) => ENTITLED_STATUSES.includes(sub.status));
  }

  /**
   * Get all subscriptions for a user.
   */
  async getSubscriptions(telegramUserId: number): Promise<Subscription[]> {
    return this.store.getByUserId(this.appId, telegramUserId);
  }

  /**
   * Get the active subscription for a user (first entitled subscription found).
   */
  async getActiveSubscription(telegramUserId: number): Promise<Subscription | null> {
    const subscriptions = await this.store.getByUserId(this.appId, telegramUserId);
    return subscriptions.find((sub) => ENTITLED_STATUSES.includes(sub.status)) ?? null;
  }

  /**
   * Handle a successful payment event - creates or renews a subscription.
   */
  async handleSuccessfulPayment(
    payment: SuccessfulPayment,
    telegramUserId: number,
    productId: string,
    priceId: string
  ): Promise<Subscription> {
    const existing = await this.store.getByPayload(this.appId, payment.invoice_payload);

    if (!existing) {
      // New subscription (first payment)
      const sub = await this.store.create({
        app_id: this.appId,
        customer_id: `cust_${telegramUserId}`,
        telegram_user_id: telegramUserId,
        product_id: productId,
        price_id: priceId,
        status: 'active',
        amount: payment.total_amount,
        telegram_payment_charge_id: payment.telegram_payment_charge_id,
        provider_payment_charge_id: payment.provider_payment_charge_id,
        invoice_payload: payment.invoice_payload,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: payment.subscription_expiration_date ?? null,
        cancel_at_period_end: false,
        canceled_at: null,
        grace_period_seconds: this.gracePeriod,
      });
      await this.emit('subscription.created', sub);
      await this.emit('subscription.activated', sub);
      return sub;
    }

    // Renewal - extend subscription
    const updated = await this.transition(existing.id, 'active', {
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      provider_payment_charge_id: payment.provider_payment_charge_id,
      current_period_start: existing.current_period_end ?? Math.floor(Date.now() / 1000),
      current_period_end: payment.subscription_expiration_date ?? null,
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
    const updated = await this.transition(subscriptionId, 'revoked');
    await this.emit('subscription.revoked', updated);
    return updated;
  }

  /**
   * Re-enable a previously canceled or revoked subscription.
   */
  async reactivateSubscription(subscriptionId: string): Promise<Subscription> {
    const sub = await this.store.getById(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

    if (sub.status === 'revoked') {
      const updated = await this.transition(subscriptionId, 'canceled', {
        cancel_at_period_end: false,
        canceled_at: null,
      });
      await this.emit('subscription.reactivated', updated);
      return updated;
    }

    if (sub.status === 'canceled') {
      const updated = await this.transition(subscriptionId, 'active', {
        cancel_at_period_end: false,
        canceled_at: null,
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
    const expiredActive = await this.store.getExpiredActive(now);
    for (const sub of expiredActive) {
      const updated = await this.transition(sub.id, 'past_due');
      await this.emit('subscription.past_due', updated);
    }

    // Past_due subscriptions past their grace period → expired
    const pastDueExpired = await this.store.getPastDueExpired(now);
    for (const sub of pastDueExpired) {
      const updated = await this.transition(sub.id, 'expired');
      await this.emit('subscription.expired', updated);
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
      ...additionalFields,
    });
  }

  private async emit(event: SubscriptionEventType, subscription: Subscription): Promise<void> {
    if (this.onEvent) {
      await this.onEvent(event, subscription);
    }
  }
}
