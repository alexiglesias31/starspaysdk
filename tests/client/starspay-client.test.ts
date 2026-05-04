import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StarsPayClient, isEntitled } from '../../src/client/starspay-client';
import type { Subscription } from '../../src/types/subscription';

describe('StarsPayClient', () => {
  let client: StarsPayClient;

  beforeEach(() => {
    client = new StarsPayClient({
      apiKey: 'sp_pub_123',
      apiUrl: 'https://api.test.starspay.dev',
      cacheTtl: 5000,
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isActive', () => {
    it('should return true when user has active subscription', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ active: true, subscription: { id: 'sub_1', status: 'active' } }), {
          status: 200,
        })
      );

      const result = await client.isActive(12345);
      expect(result).toBe(true);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.starspay.dev/v1/subscriptions/active/12345',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sp_pub_123',
          }),
        })
      );
    });

    it('should return false when user has no active subscription', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ active: false }), { status: 200 })
      );

      const result = await client.isActive(99999);
      expect(result).toBe(false);
    });

    it('should cache results for cacheTtl duration', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ active: true }), { status: 200 })
      );

      // First call - fetches from API
      await client.isActive(12345);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call - uses cache
      await client.isActive(12345);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should clear cache after invalidation', async () => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ active: true }), { status: 200 }))
      );

      await client.isActive(12345);
      expect(fetch).toHaveBeenCalledTimes(1);

      client.invalidateUser(12345);

      await client.isActive(12345);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache', async () => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ active: true }), { status: 200 }))
      );

      await client.isActive(12345);
      client.clearCache();

      await client.isActive(12345);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should not poison getActiveSubscription cache when isActive sees active=true without a subscription', async () => {
      const subscription = {
        id: 'sub_1',
        app_id: 'app_1',
        customer_id: 'cust_1',
        telegram_user_id: 12345,
        product_id: 'prod_1',
        price_id: 'price_1',
        status: 'active',
        amount: 100,
        telegram_payment_charge_id: null,
        provider_payment_charge_id: null,
        invoice_payload: 'payload',
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        canceled_at: null,
        grace_period_seconds: 259200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } satisfies Subscription;

      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ active: true }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ active: true, subscription }), { status: 200 })
        );

      expect(await client.isActive(12345)).toBe(true);
      expect(await client.getActiveSubscription(12345)).toEqual(subscription);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getProducts', () => {
    it('should fetch and cache products', async () => {
      const products = [
        { id: 'prod_1', name: 'Premium', type: 'subscription', active: true },
      ];
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ products }), { status: 200 })
      );

      const result = await client.getProducts();
      expect(result).toEqual(products);

      // Should use cache on second call
      await client.getProducts();
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('sensitive browser methods', () => {
    it('should reject getSubscriptions() in the browser client', async () => {
      await expect(client.getSubscriptions(12345)).rejects.toThrow(
        'getSubscriptions() is not available in the browser client'
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject getCustomer() in the browser client', async () => {
      await expect(client.getCustomer(12345)).rejects.toThrow(
        'getCustomer() is not available in the browser client'
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('getPrice', () => {
    it('should fetch price and product by priceId', async () => {
      const data = {
        price: { id: 'price_1', product_id: 'prod_1', amount: 100, currency: 'XTR' },
        product: { id: 'prod_1', name: 'Premium', type: 'subscription' },
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(data), { status: 200 })
      );

      const result = await client.getPrice('price_1');

      expect(result.price.id).toBe('price_1');
      expect(result.product.name).toBe('Premium');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.starspay.dev/v1/prices/price_1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sp_pub_123',
          }),
        })
      );
    });

    it('should cache getPrice results', async () => {
      const data = {
        price: { id: 'price_1', product_id: 'prod_1', amount: 100, currency: 'XTR' },
        product: { id: 'prod_1', name: 'Premium', type: 'subscription' },
      };
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(data), { status: 200 })
      );

      await client.getPrice('price_1');
      await client.getPrice('price_1');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createInvoiceLink', () => {
    it('should POST to invoices endpoint', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://t.me/$inv_123' }), { status: 200 })
      );

      const url = await client.createInvoiceLink({
        priceId: 'price_1',
        telegramUserId: 12345,
      });

      expect(url).toBe('https://t.me/$inv_123');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.starspay.dev/v1/invoices/create',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            priceId: 'price_1',
            telegramUserId: 12345,
          }),
        })
      );
    });

    it('should reject invalid Telegram user IDs before sending a request', async () => {
      await expect(client.createInvoiceLink({
        priceId: 'price_1',
        telegramUserId: 0,
      })).rejects.toThrow('StarsPay: invalid Telegram user ID: 0');

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('openPayment', () => {
    it('should throw if Telegram WebApp is not available', async () => {
      await expect(client.openPayment('https://t.me/$inv_123')).rejects.toThrow(
        'Telegram WebApp SDK not available'
      );
    });

    it('should call Telegram.WebApp.openInvoice', async () => {
      const openInvoice = vi.fn((url: string, cb: (status: string) => void) => {
        cb('paid');
      });

      vi.stubGlobal('Telegram', { WebApp: { openInvoice } });

      const status = await client.openPayment('https://t.me/$inv_123');

      expect(status).toBe('paid');
      expect(openInvoice).toHaveBeenCalledWith('https://t.me/$inv_123', expect.any(Function));

      // Cleanup
      vi.stubGlobal('Telegram', undefined);
    });
  });

  describe('openExternalPayment', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      delete (globalThis as any).Telegram;
      delete (globalThis as any).window;
    });

    it('uses Telegram.WebApp.openTelegramLink for t.me URLs', () => {
      const mockOpenTelegramLink = vi.fn();
      (globalThis as any).Telegram = { WebApp: { openTelegramLink: mockOpenTelegramLink } };
      client.openExternalPayment('https://t.me/CryptoBot?start=abc');
      expect(mockOpenTelegramLink).toHaveBeenCalledWith('https://t.me/CryptoBot?start=abc');
    });

    it('uses Telegram.WebApp.openLink for non-t.me URLs', () => {
      const mockOpenLink = vi.fn();
      (globalThis as any).Telegram = { WebApp: { openLink: mockOpenLink } };
      client.openExternalPayment('https://pay.crypt.bot/invoice/abc');
      expect(mockOpenLink).toHaveBeenCalledWith('https://pay.crypt.bot/invoice/abc');
    });

    it('falls back to window.open when Telegram.WebApp not available', () => {
      const mockOpen = vi.fn();
      (globalThis as any).window = { open: mockOpen };
      delete (globalThis as any).Telegram;
      client.openExternalPayment('https://pay.crypt.bot/invoice/abc');
      expect(mockOpen).toHaveBeenCalledWith('https://pay.crypt.bot/invoice/abc', '_blank');
    });
  });

  describe('error handling', () => {
    it('should throw on non-200 response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 })
      );

      await expect(client.isActive(12345)).rejects.toThrow('StarsPay API error: 401');
    });
  });

  describe('constructor validation', () => {
    it('should reject server API keys in the browser client', () => {
      expect(() => new StarsPayClient({
        apiKey: 'sp_test_123',
        apiUrl: 'https://api.test.starspay.dev',
      })).toThrow('Do not use server API keys in the browser client');
    });

    it('should require the publishable key prefix', () => {
      expect(() => new StarsPayClient({
        apiKey: 'not-a-starspay-key',
        apiUrl: 'https://api.test.starspay.dev',
      })).toThrow('browser client apiKey must be a publishable key');
    });
  });
});

describe('isEntitled', () => {
  function makeSub(status: string): Subscription {
    return {
      id: 'sub_1',
      app_id: 'app_1',
      customer_id: 'cust_1',
      telegram_user_id: 12345,
      product_id: 'prod_1',
      price_id: 'price_1',
      status: status as Subscription['status'],
      amount: 100,
      telegram_payment_charge_id: null,
      provider_payment_charge_id: null,
      invoice_payload: 'test',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      grace_period_seconds: 259200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  it('should return true for active subscription', () => {
    expect(isEntitled(makeSub('active'))).toBe(true);
  });

  it('should return true for canceled subscription', () => {
    expect(isEntitled(makeSub('canceled'))).toBe(true);
  });

  it('should return true for past_due subscription', () => {
    expect(isEntitled(makeSub('past_due'))).toBe(true);
  });

  it('should return false for expired subscription', () => {
    expect(isEntitled(makeSub('expired'))).toBe(false);
  });

  it('should return false for revoked subscription', () => {
    expect(isEntitled(makeSub('revoked'))).toBe(false);
  });

  it('should return false for null subscription', () => {
    expect(isEntitled(null)).toBe(false);
  });
});
