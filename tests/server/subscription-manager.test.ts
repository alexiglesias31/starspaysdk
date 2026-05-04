import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionManager, type SubscriptionStore } from '../../src/server/subscription-manager';
import type { Subscription } from '../../src/types/subscription';
import type { SuccessfulPayment } from '../../src/types/telegram';

function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub_1',
    app_id: 'app_1',
    customer_id: 'cust_1',
    telegram_user_id: 12345,
    product_id: 'prod_1',
    price_id: 'price_1',
    status: 'active',
    amount: 100,
    telegram_payment_charge_id: 'charge_1',
    provider_payment_charge_id: 'provider_1',
    invoice_payload: 'sub:premium:12345',
    current_period_start: Math.floor(Date.now() / 1000) - 86400,
    current_period_end: Math.floor(Date.now() / 1000) + 86400 * 29,
    cancel_at_period_end: false,
    canceled_at: null,
    grace_period_seconds: 259200,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockStore(subs: Subscription[] = []): SubscriptionStore {
  const store: Map<string, Subscription> = new Map();
  subs.forEach((s) => store.set(s.id, { ...s }));

  return {
    getByPayload: vi.fn(async (_appId: string, payload: string, _telegramUserId: number) => {
      return Array.from(store.values()).find((s) => s.invoice_payload === payload) ?? null;
    }),
    getByUserId: vi.fn(async (_appId: string, userId: number) => {
      return Array.from(store.values()).filter((s) => s.telegram_user_id === userId);
    }),
    getById: vi.fn(async (id: string) => {
      return store.get(id) ?? null;
    }),
    getByChargeId: vi.fn(async (_appId: string, chargeId: string) => {
      return Array.from(store.values()).find((s) => s.telegram_payment_charge_id === chargeId) ?? null;
    }),
    create: vi.fn(async (data) => {
      const sub: Subscription = {
        ...data,
        id: `sub_${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.set(sub.id, sub);
      return sub;
    }),
    update: vi.fn(async (id: string, fields: Partial<Subscription>) => {
      const existing = store.get(id);
      if (!existing) throw new Error(`Not found: ${id}`);
      const updated = { ...existing, ...fields, updated_at: new Date().toISOString() };
      store.set(id, updated);
      return updated;
    }),
    getExpiredActive: vi.fn(async (now: number) => {
      return Array.from(store.values()).filter(
        (s) => s.status === 'active' && s.current_period_end !== null && s.current_period_end < now
      );
    }),
    getPastDueExpired: vi.fn(async (now: number) => {
      return Array.from(store.values()).filter(
        (s) =>
          s.status === 'past_due' &&
          s.current_period_end !== null &&
          s.current_period_end + s.grace_period_seconds < now
      );
    }),
  };
}

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;
  let mockStore: SubscriptionStore;
  let onEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onEvent = vi.fn();
    mockStore = createMockStore();
    manager = new SubscriptionManager({
      appId: 'app_1',
      store: mockStore,
      gracePeriodSeconds: 259200,
      onEvent,
    });
  });

  describe('isActive', () => {
    it('should return true for active subscription', async () => {
      const activeSub = createMockSubscription({ status: 'active' });
      mockStore = createMockStore([activeSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore });

      expect(await manager.isActive(12345)).toBe(true);
    });

    it('should return true for canceled subscription (still has access)', async () => {
      const canceledSub = createMockSubscription({ status: 'canceled' });
      mockStore = createMockStore([canceledSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore });

      expect(await manager.isActive(12345)).toBe(true);
    });

    it('should return true for past_due subscription (in grace period, default policy)', async () => {
      const pastDueSub = createMockSubscription({ status: 'past_due' });
      mockStore = createMockStore([pastDueSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore });

      expect(await manager.isActive(12345)).toBe(true);
    });

    it('should return true for past_due when retain_access_during_grace is true', async () => {
      const pastDueSub = createMockSubscription({ status: 'past_due', retain_access_during_grace: true });
      mockStore = createMockStore([pastDueSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore });

      expect(await manager.isActive(12345)).toBe(true);
    });

    it('should return false for past_due when retain_access_during_grace is false', async () => {
      const pastDueSub = createMockSubscription({ status: 'past_due', retain_access_during_grace: false });
      mockStore = createMockStore([pastDueSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore });

      expect(await manager.isActive(12345)).toBe(false);
    });

    it('should return false for expired subscription', async () => {
      const expiredSub = createMockSubscription({ status: 'expired' });
      mockStore = createMockStore([expiredSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore });

      expect(await manager.isActive(12345)).toBe(false);
    });

    it('should return false for revoked subscription', async () => {
      const revokedSub = createMockSubscription({ status: 'revoked' });
      mockStore = createMockStore([revokedSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore });

      expect(await manager.isActive(12345)).toBe(false);
    });

    it('should return false for user with no subscriptions', async () => {
      expect(await manager.isActive(99999)).toBe(false);
    });
  });

  describe('handleSuccessfulPayment', () => {
    it('should create a new subscription on first payment', async () => {
      const payment: SuccessfulPayment = {
        currency: 'XTR',
        total_amount: 100,
        invoice_payload: 'sub:premium:12345:new',
        telegram_payment_charge_id: 'charge_new',
        provider_payment_charge_id: 'provider_new',
        subscription_expiration_date: Math.floor(Date.now() / 1000) + 2592000,
        is_recurring: true,
        is_first_recurring: true,
      };

      const result = await manager.handleSuccessfulPayment(payment, 12345, 'prod_1', 'price_1');

      expect(result.status).toBe('active');
      expect(result.amount).toBe(100);
      expect(result.telegram_payment_charge_id).toBe('charge_new');
      expect(onEvent).toHaveBeenCalledWith('subscription.created', expect.any(Object));
      expect(onEvent).not.toHaveBeenCalledWith('subscription.activated', expect.any(Object));
    });

    it('should return existing subscription when charge ID is already processed (idempotency)', async () => {
      const existingSub = createMockSubscription({
        telegram_payment_charge_id: 'charge_duplicate',
        invoice_payload: 'sub:premium:12345:dupe',
      });
      mockStore = createMockStore([existingSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      const payment: SuccessfulPayment = {
        currency: 'XTR',
        total_amount: 100,
        invoice_payload: 'sub:premium:12345:dupe',
        telegram_payment_charge_id: 'charge_duplicate',
        provider_payment_charge_id: 'provider_dup',
        subscription_expiration_date: Math.floor(Date.now() / 1000) + 2592000,
        is_recurring: true,
        is_first_recurring: true,
      };

      const result = await manager.handleSuccessfulPayment(payment, 12345, 'prod_1', 'price_1');

      // Should return the existing subscription, not create a new one
      expect(result.id).toBe('sub_1');
      expect(mockStore.create).not.toHaveBeenCalled();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('should renew an existing subscription', async () => {
      const existingSub = createMockSubscription({
        invoice_payload: 'sub:premium:12345:existing',
        current_period_end: Math.floor(Date.now() / 1000),
      });
      mockStore = createMockStore([existingSub]);
      manager = new SubscriptionManager({
        appId: 'app_1',
        store: mockStore,
        onEvent,
      });

      const payment: SuccessfulPayment = {
        currency: 'XTR',
        total_amount: 100,
        invoice_payload: 'sub:premium:12345:existing',
        telegram_payment_charge_id: 'charge_renewal',
        provider_payment_charge_id: 'provider_renewal',
        subscription_expiration_date: Math.floor(Date.now() / 1000) + 2592000,
        is_recurring: true,
      };

      const result = await manager.handleSuccessfulPayment(payment, 12345, 'prod_1', 'price_1');

      expect(result.status).toBe('active');
      expect(result.telegram_payment_charge_id).toBe('charge_renewal');
      expect(onEvent).toHaveBeenCalledWith('subscription.renewed', expect.any(Object));
    });
  });

  describe('cancelSubscription', () => {
    it('should transition active to canceled', async () => {
      const activeSub = createMockSubscription({ status: 'active' });
      mockStore = createMockStore([activeSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      const result = await manager.cancelSubscription('sub_1');

      expect(result.status).toBe('canceled');
      expect(result.cancel_at_period_end).toBe(true);
      expect(result.canceled_at).toBeTruthy();
      expect(onEvent).toHaveBeenCalledWith('subscription.canceled', expect.any(Object));
    });

    it('should throw on invalid transition', async () => {
      const expiredSub = createMockSubscription({ status: 'expired' });
      mockStore = createMockStore([expiredSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore });

      await expect(manager.cancelSubscription('sub_1')).rejects.toThrow('Invalid transition');
    });
  });

  describe('revokeSubscription', () => {
    it('should transition active to revoked', async () => {
      const activeSub = createMockSubscription({ status: 'active' });
      mockStore = createMockStore([activeSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      const result = await manager.revokeSubscription('sub_1');

      expect(result.status).toBe('revoked');
      expect(onEvent).toHaveBeenCalledWith('subscription.revoked', expect.any(Object));
    });
  });

  describe('reactivateSubscription', () => {
    it('should reactivate canceled subscription', async () => {
      const canceledSub = createMockSubscription({ status: 'canceled' });
      mockStore = createMockStore([canceledSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      const result = await manager.reactivateSubscription('sub_1');

      expect(result.status).toBe('active');
      expect(result.cancel_at_period_end).toBe(false);
      expect(onEvent).toHaveBeenCalledWith('subscription.reactivated', expect.any(Object));
    });

    it('should throw when attempting to reactivate a revoked subscription', async () => {
      const revokedSub = createMockSubscription({ status: 'revoked' });
      mockStore = createMockStore([revokedSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      await expect(manager.reactivateSubscription('sub_1')).rejects.toThrow(
        'Cannot reactivate a revoked subscription'
      );
    });

    it('should throw when reactivating expired subscription without reason', async () => {
      const expiredSub = createMockSubscription({ status: 'expired' });
      mockStore = createMockStore([expiredSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      await expect(manager.reactivateSubscription('sub_1')).rejects.toThrow(
        'Cannot reactivate an expired subscription without a new payment or explicit admin override'
      );
    });

    it('should reactivate expired subscription with admin_override reason', async () => {
      const expiredSub = createMockSubscription({ status: 'expired' });
      mockStore = createMockStore([expiredSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      const result = await manager.reactivateSubscription('sub_1', 'admin_override');
      expect(result.status).toBe('active');
      expect(result.cancel_at_period_end).toBe(false);
      expect(onEvent).toHaveBeenCalledWith('subscription.reactivated', result);
    });
  });

  describe('checkExpiredSubscriptions', () => {
    it('should transition active subs past period end to past_due', async () => {
      const expiredActiveSub = createMockSubscription({
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });
      mockStore = createMockStore([expiredActiveSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      await manager.checkExpiredSubscriptions();

      expect(onEvent).toHaveBeenCalledWith('subscription.past_due', expect.any(Object));
    });

    it('should transition past_due subs past grace period to expired', async () => {
      const pastDueSub = createMockSubscription({
        status: 'past_due',
        current_period_end: Math.floor(Date.now() / 1000) - 300000, // Past grace period
        grace_period_seconds: 259200,
      });
      mockStore = createMockStore([pastDueSub]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      await manager.checkExpiredSubscriptions();

      expect(onEvent).toHaveBeenCalledWith('subscription.expired', expect.any(Object));
    });

    it('should not transition subs still within grace period', async () => {
      const recentPastDue = createMockSubscription({
        status: 'past_due',
        current_period_end: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        grace_period_seconds: 259200, // 3 days
      });
      mockStore = createMockStore([recentPastDue]);
      manager = new SubscriptionManager({ appId: 'app_1', store: mockStore, onEvent });

      await manager.checkExpiredSubscriptions();

      // Should not have been called with 'subscription.expired'
      expect(onEvent).not.toHaveBeenCalledWith(
        'subscription.expired',
        expect.any(Object)
      );
    });
  });
});
