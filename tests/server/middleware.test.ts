import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import { createStarsPay, verifyWebhookSecret } from '../../src/server/middleware';
import type { TelegramUpdate } from '../../src/types/telegram';

describe('createStarsPay', () => {
  const config = {
    apiKey: 'sp_test_123',
    botToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
    apiUrl: 'http://localhost:54321',
    debug: false,
    testMode: true,
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a starspay instance with all methods', () => {
    const starspay = createStarsPay(config);

    expect(starspay.middleware).toBeTypeOf('function');
    expect(starspay.handleUpdate).toBeTypeOf('function');
    expect(starspay.handleBotStart).toBeTypeOf('function');
    expect(starspay.createInvoice).toBeTypeOf('function');
    expect(starspay.isActive).toBeTypeOf('function');
    expect(starspay.cancelSubscription).toBeTypeOf('function');
    expect(starspay.refund).toBeTypeOf('function');
    expect(starspay.telegram).toBeDefined();
    expect(starspay.api).toBeDefined();
  });

  describe('middleware', () => {
    it('should call next() for non-payment updates', async () => {
      const starspay = createStarsPay(config);
      const mw = starspay.middleware();

      const req = {
        body: {
          update_id: 1,
          message: {
            message_id: 1,
            date: Date.now(),
            chat: { id: 1, type: 'private' },
          },
        } as TelegramUpdate,
      };
      const res = {
        sendStatus: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await mw(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.sendStatus).not.toHaveBeenCalled();
    });

    it('should handle pre_checkout_query and respond via Telegram API', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, allowed: true, reason: null }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
        );

      const starspay = createStarsPay(config);
      const mw = starspay.middleware();

      const req = {
        body: {
          update_id: 1,
          pre_checkout_query: {
            id: 'pchk_1',
            from: { id: 12345, first_name: 'Test', is_bot: false },
            currency: 'XTR',
            total_amount: 100,
            invoice_payload: 'sub:premium',
          },
        } as TelegramUpdate,
      };
      const res = {
        sendStatus: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await mw(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:54321/v1/webhooks/pre-checkout',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            id: 'pchk_1',
            from: { id: 12345 },
            currency: 'XTR',
            total_amount: 100,
            invoice_payload: 'sub:premium',
          }),
        })
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('answerPreCheckoutQuery'),
        expect.any(Object)
      );
    });

    it('should call onPreCheckout callback', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, allowed: true, reason: null }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
        );

      const onPreCheckout = vi.fn().mockResolvedValue(true);
      const starspay = createStarsPay({ ...config, onPreCheckout });
      const mw = starspay.middleware();

      const req = {
        body: {
          update_id: 1,
          pre_checkout_query: {
            id: 'pchk_1',
            from: { id: 12345, first_name: 'Test', is_bot: false },
            currency: 'XTR',
            total_amount: 100,
            invoice_payload: 'sub:premium',
          },
        } as TelegramUpdate,
      };
      const res = { sendStatus: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await mw(req, res, next);

      expect(onPreCheckout).toHaveBeenCalledWith({
        userId: 12345,
        amount: 100,
        payload: 'sub:premium',
      });
    });

    it('should reject pre-checkout when onPreCheckout returns false', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
      );

      const onPreCheckout = vi.fn().mockResolvedValue(false);
      const starspay = createStarsPay({ ...config, onPreCheckout });
      const mw = starspay.middleware();

      const req = {
        body: {
          update_id: 1,
          pre_checkout_query: {
            id: 'pchk_1',
            from: { id: 12345, first_name: 'Test', is_bot: false },
            currency: 'XTR',
            total_amount: 100,
            invoice_payload: 'sub:premium',
          },
        } as TelegramUpdate,
      };
      const res = { sendStatus: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await mw(req, res, next);

      // Should answer with ok=false
      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(callBody.ok).toBe(false);
      expect(callBody.error_message).toBe('Payment validation failed');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should reject pre-checkout when backend validation denies the payment', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            ok: true,
            allowed: false,
            reason: 'Billing limit reached. Upgrade required.',
          }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
        );

      const starspay = createStarsPay(config);
      const mw = starspay.middleware();

      const req = {
        body: {
          update_id: 1,
          pre_checkout_query: {
            id: 'pchk_1',
            from: { id: 12345, first_name: 'Test', is_bot: false },
            currency: 'XTR',
            total_amount: 100,
            invoice_payload: 'sub:premium',
          },
        } as TelegramUpdate,
      };
      const res = { sendStatus: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };

      await mw(req, res, vi.fn());

      const answerBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string);
      expect(answerBody.ok).toBe(false);
      expect(answerBody.error_message).toBe('Billing limit reached. Upgrade required.');
    });
  });

  describe('createInvoice', () => {
    it('should create a subscription invoice', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: 'https://t.me/$inv_123' }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const url = await starspay.createInvoice({
        title: 'Premium',
        description: 'Monthly premium',
        payload: 'sub:premium:123',
        amount: 100,
        subscription: true,
      });

      expect(url).toBe('https://t.me/$inv_123');
      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(callBody.subscription_period).toBe(2592000);
      expect(callBody.currency).toBe('XTR');
    });

    it('should create a one-time purchase invoice', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: 'https://t.me/$inv_456' }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const url = await starspay.createInvoice({
        title: 'Item',
        description: 'One-time item',
        payload: 'purchase:item:123',
        amount: 50,
      });

      expect(url).toBe('https://t.me/$inv_456');
      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(callBody.subscription_period).toBeUndefined();
    });

    it('should throw when title is empty', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createInvoice({
        title: '',
        description: 'A description',
        payload: 'some:payload',
        amount: 50,
      })).rejects.toThrow('title is required and must be 1-32 bytes');
    });

    it('should throw when title exceeds 32 bytes', async () => {
      const starspay = createStarsPay(config);
      // 33 ASCII characters = 33 bytes
      const longTitle = 'A'.repeat(33);
      await expect(starspay.createInvoice({
        title: longTitle,
        description: 'A description',
        payload: 'some:payload',
        amount: 50,
      })).rejects.toThrow('title is required and must be 1-32 bytes');
    });

    it('should throw when description is empty', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createInvoice({
        title: 'Valid Title',
        description: '',
        payload: 'some:payload',
        amount: 50,
      })).rejects.toThrow('description is required and must be 1-255 bytes');
    });

    it('should throw when description exceeds 255 bytes', async () => {
      const starspay = createStarsPay(config);
      const longDescription = 'D'.repeat(256);
      await expect(starspay.createInvoice({
        title: 'Valid Title',
        description: longDescription,
        payload: 'some:payload',
        amount: 50,
      })).rejects.toThrow('description is required and must be 1-255 bytes');
    });

    it('should throw when payload is empty', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createInvoice({
        title: 'Valid Title',
        description: 'A description',
        payload: '',
        amount: 50,
      })).rejects.toThrow('payload is required and must be 1-128 bytes');
    });

    it('should throw when payload exceeds 128 bytes', async () => {
      const starspay = createStarsPay(config);
      const longPayload = 'p'.repeat(129);
      await expect(starspay.createInvoice({
        title: 'Valid Title',
        description: 'A description',
        payload: longPayload,
        amount: 50,
      })).rejects.toThrow('payload is required and must be 1-128 bytes');
    });

    it('should throw when payload contains control characters', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createInvoice({
        title: 'Valid Title',
        description: 'A description',
        payload: 'bad\x01payload',
        amount: 50,
      })).rejects.toThrow('payload must not contain control characters');
    });

    it('should throw when amount is below minimum (0)', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createInvoice({
        title: 'Valid Title',
        description: 'A description',
        payload: 'some:payload',
        amount: 0,
      })).rejects.toThrow('invalid invoice amount');
    });

    it('should throw when amount exceeds maximum (10001)', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createInvoice({
        title: 'Valid Title',
        description: 'A description',
        payload: 'some:payload',
        amount: 10001,
      })).rejects.toThrow('invalid invoice amount');
    });

    it('should throw when amount is a non-integer', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createInvoice({
        title: 'Valid Title',
        description: 'A description',
        payload: 'some:payload',
        amount: 9.99,
      })).rejects.toThrow('invalid invoice amount');
    });
  });

  describe('isActive', () => {
    it('should return true without calling the API in testMode', async () => {
      const starspay = createStarsPay(config);
      const result = await starspay.isActive(12345);

      expect(result).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should call the API and return the active field in normal mode', async () => {
      // Normal mode requires webhookSecret — omit testMode
      const normalConfig = {
        apiKey: 'sp_test_123',
        botToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
        apiUrl: 'http://localhost:54321',
        webhookSecret: 'test-secret-for-normal-mode',
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ active: true }), { status: 200 })
      );

      const starspay = createStarsPay(normalConfig);
      const result = await starspay.isActive(12345);

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/v1/subscriptions/active/12345');
    });

    it('should return false when API reports inactive subscription', async () => {
      const normalConfig = {
        apiKey: 'sp_test_123',
        botToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
        apiUrl: 'http://localhost:54321',
        webhookSecret: 'test-secret-for-normal-mode',
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ active: false }), { status: 200 })
      );

      const starspay = createStarsPay(normalConfig);
      const result = await starspay.isActive(99999);

      expect(result).toBe(false);
    });
  });

  describe('cancelSubscription', () => {
    it('should delegate to telegram.editUserStarSubscription with isCanceled=true', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.cancelSubscription(12345, 'charge_abc123');

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain('editUserStarSubscription');
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.user_id).toBe(12345);
      expect(body.telegram_payment_charge_id).toBe('charge_abc123');
      expect(body.is_canceled).toBe(true);
    });

    it('should propagate errors from the Telegram API', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request' }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      await expect(starspay.cancelSubscription(12345, 'charge_bad')).rejects.toThrow('Bad Request');
    });
  });

  describe('refund', () => {
    it('should delegate to telegram.refundStarPayment', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.refund(12345, 'charge_xyz789');

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain('refundStarPayment');
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.user_id).toBe(12345);
      expect(body.telegram_payment_charge_id).toBe('charge_xyz789');
    });

    it('should propagate errors from the Telegram API', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error_code: 400, description: 'Payment not found' }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      await expect(starspay.refund(12345, 'charge_missing')).rejects.toThrow('Payment not found');
    });
  });

  describe('handleBotStart', () => {
    it('should return false for non-product-link params', async () => {
      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, 'hello');
      expect(result).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return false for empty string', async () => {
      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, '');
      expect(result).toBe(false);
    });

    it('should send invoice for one-time product', async () => {
      // First call: getPrice (API client)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_1', app_id: 'price_app_1', product_id: 'prod_1', amount: 50, currency: 'XTR', period: null },
          product: { id: 'prod_1', name: 'Digital Item', description: 'A cool item', type: 'one_time', active: true },
        }), { status: 200 })
      );
      // Second call: sendInvoice (Telegram API)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, 'buy_price_1');

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);

      // Second call should be sendInvoice
      const invoiceCall = vi.mocked(fetch).mock.calls[1];
      expect(invoiceCall[0]).toContain('sendInvoice');
      const body = JSON.parse(invoiceCall[1]?.body as string);
      expect(body.chat_id).toBe(12345);
      expect(body.title).toBe('Digital Item');
      expect(body.prices[0].amount).toBe(50);
      expect(body.currency).toBe('XTR');
      expect(body.payload).toBe('starspay:price_app_1:price_1:12345');
    });

    it('should create invoice link and send message for subscription product', async () => {
      // First call: getPrice (API client)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_2', app_id: 'price_app_2', product_id: 'prod_2', amount: 100, currency: 'XTR', period: 2592000 },
          product: { id: 'prod_2', name: 'Premium', description: 'Monthly premium', type: 'subscription', active: true },
        }), { status: 200 })
      );
      // Second call: createInvoiceLink (Telegram API)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: 'https://t.me/$inv_sub' }), { status: 200 })
      );
      // Third call: sendMessage (Telegram API)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 2 } }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(99999, 'buy_price_2');

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(3);

      // Second call should be createInvoiceLink
      const linkCall = vi.mocked(fetch).mock.calls[1];
      expect(linkCall[0]).toContain('createInvoiceLink');
      const linkBody = JSON.parse(linkCall[1]?.body as string);
      expect(linkBody.subscription_period).toBe(2592000);
      expect(linkBody.payload).toBe('starspay:price_app_2:price_2');

      // Third call should be sendMessage with inline keyboard
      const msgCall = vi.mocked(fetch).mock.calls[2];
      expect(msgCall[0]).toContain('sendMessage');
      const msgBody = JSON.parse(msgCall[1]?.body as string);
      expect(msgBody.chat_id).toBe(99999);
      expect(msgBody.text).toContain('Premium');
      expect(msgBody.reply_markup.inline_keyboard[0][0].url).toBe('https://t.me/$inv_sub');
    });

    it('weekly subscription: omits subscription_period (Stars cannot natively recur 7-day; scheduler drives renewals)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_w', app_id: 'app_w', product_id: 'prod_w', amount: 50, currency: 'EUR', period: 604800 },
          product: { id: 'prod_w', name: 'Weekly Pro', description: 'Weekly access', type: 'subscription', active: true },
        }), { status: 200 })
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: 'https://t.me/$inv_w' }), { status: 200 })
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(11111, 'buy_price_w');
      expect(result).toBe(true);

      const linkCall = vi.mocked(fetch).mock.calls[1];
      expect(linkCall[0]).toContain('createInvoiceLink');
      const linkBody = JSON.parse(linkCall[1]?.body as string);
      expect(linkBody.subscription_period).toBeUndefined();
    });

    it('yearly subscription: omits subscription_period (365-day not supported by Telegram native recurring)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_y', app_id: 'app_y', product_id: 'prod_y', amount: 5000, currency: 'USD', period: 31536000 },
          product: { id: 'prod_y', name: 'Yearly Pro', description: 'Annual', type: 'subscription', active: true },
        }), { status: 200 })
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: 'https://t.me/$inv_y' }), { status: 200 })
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 10 } }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(22222, 'buy_price_y');
      expect(result).toBe(true);

      const linkCall = vi.mocked(fetch).mock.calls[1];
      const linkBody = JSON.parse(linkCall[1]?.body as string);
      expect(linkBody.subscription_period).toBeUndefined();
    });

    it('rejects an unknown / non-canonical period from the API', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_bad', app_id: 'app_bad', product_id: 'prod_bad', amount: 100, currency: 'XTR', period: 99999 },
          product: { id: 'prod_bad', name: 'Bad', description: '', type: 'subscription', active: true },
        }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(33333, 'buy_price_bad');
      // Helper returns false and does not call createInvoiceLink for unknown periods.
      expect(result).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1); // only the getPrice call
    });

    it('should truncate invoice fields from product data to Telegram byte limits', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_3', app_id: 'price_app_3', product_id: 'prod_3', amount: 75, currency: 'XTR', period: null, active: true },
          product: {
            id: 'prod_3',
            name: 'A'.repeat(40),
            description: 'B'.repeat(300),
            type: 'one_time',
            active: true,
          },
        }), { status: 200 })
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 3 } }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, 'buy_price_3');

      expect(result).toBe(true);
      const invoiceCall = vi.mocked(fetch).mock.calls[1];
      const body = JSON.parse(invoiceCall[1]?.body as string);
      expect(body.title).toBe(`${'A'.repeat(29)}...`);
      expect(body.description).toBe(`${'B'.repeat(252)}...`);
      expect(body.prices[0].label).toBe(`${'A'.repeat(29)}...`);
    });

    it('should reject the webhook so Telegram retries when onEvent fails after payment recording', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          payment: { id: 'pay_1' },
          subscription: null,
        }), { status: 200 })
      );

      const onEvent = vi.fn().mockRejectedValue(new Error('fulfillment failed'));
      const starspay = createStarsPay({ ...config, onEvent });

      await expect(starspay.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: Date.now(),
          from: { id: 12345, first_name: 'Test' },
          chat: { id: 12345, type: 'private' },
          successful_payment: {
            currency: 'XTR',
            total_amount: 50,
            invoice_payload: 'purchase:item:123',
            telegram_payment_charge_id: 'charge_1',
            provider_payment_charge_id: 'provider_1',
          },
        },
      })).rejects.toThrow('fulfillment failed');

      expect(onEvent).toHaveBeenCalledWith('payment.one_time', {
        subscription: null,
        telegramUserId: 12345,
        amount: 50,
        payload: 'purchase:item:123',
      });
    });

    it('should propagate API errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      );

      const starspay = createStarsPay(config);

      await expect(starspay.handleBotStart(12345, 'buy_nonexistent')).rejects.toThrow();
    });

    it('should return false when product is inactive', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_1', product_id: 'prod_1', amount: 50, currency: 'XTR', period: null },
          product: { id: 'prod_1', name: 'Disabled Item', description: 'No longer sold', type: 'one_time', active: false },
        }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, 'buy_price_1');

      expect(result).toBe(false);
      // Only the getPrice API call should have been made — no Telegram call
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return false when price is inactive', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_2', product_id: 'prod_2', amount: 100, currency: 'XTR', period: null, active: false },
          product: { id: 'prod_2', name: 'Active Product', description: 'Still sold', type: 'one_time', active: true },
        }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, 'buy_price_2');

      expect(result).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return false when price amount is below minimum', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_3', product_id: 'prod_3', amount: 0, currency: 'XTR', period: null, active: true },
          product: { id: 'prod_3', name: 'Free Item', description: 'Zero cost', type: 'one_time', active: true },
        }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, 'buy_price_3');

      expect(result).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return false when price amount exceeds maximum', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_4', product_id: 'prod_4', amount: 99999, currency: 'XTR', period: null, active: true },
          product: { id: 'prod_4', name: 'Luxury Item', description: 'Very expensive', type: 'one_time', active: true },
        }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, 'buy_price_4');

      expect(result).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return false when price amount is a non-integer', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          price: { id: 'price_5', product_id: 'prod_5', amount: 9.99, currency: 'XTR', period: null, active: true },
          product: { id: 'prod_5', name: 'Priced Item', description: 'Bad amount', type: 'one_time', active: true },
        }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.handleBotStart(12345, 'buy_price_5');

      expect(result).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw when chatId is zero', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.handleBotStart(0, 'buy_price_1')).rejects.toThrow('invalid chatId');
    });
  });
});

describe('verifyWebhookSecret', () => {
  it('returns true for matching secrets', () => {
    expect(verifyWebhookSecret('my-secret-token', 'my-secret-token')).toBe(true);
  });

  it('returns false for mismatched secrets', () => {
    expect(verifyWebhookSecret('wrong-token', 'my-secret-token')).toBe(false);
  });

  it('returns false for null header value', () => {
    expect(verifyWebhookSecret(null, 'my-secret-token')).toBe(false);
  });

  it('returns false for undefined header value', () => {
    expect(verifyWebhookSecret(undefined, 'my-secret-token')).toBe(false);
  });

  it('returns false for empty string header value', () => {
    expect(verifyWebhookSecret('', 'my-secret-token')).toBe(false);
  });

  it('returns false for different-length secrets', () => {
    expect(verifyWebhookSecret('short', 'much-longer-secret-here')).toBe(false);
  });
});

describe('multi-provider middleware', () => {
  const config = {
    apiKey: 'sp_test_123',
    botToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
    apiUrl: 'http://localhost:54321',
    debug: false,
    testMode: true,
  };

  const configWithProviders = {
    ...config,
    payments: {
      providers: {
        telegram_payments: { token: '123456:LIVE:ProviderToken', testToken: '123456:TEST:ProviderToken' },
      },
    },
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should expose createProviderInvoice and refundPayment methods', () => {
    const starspay = createStarsPay(config);
    expect(starspay.createProviderInvoice).toBeTypeOf('function');
    expect(starspay.refundPayment).toBeTypeOf('function');
  });

  describe('createProviderInvoice', () => {
    it('should create invoice with Stars provider', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: 'https://t.me/$inv_stars' }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.createProviderInvoice({
        title: 'Premium',
        description: 'Monthly premium',
        payload: 'sub:premium:123',
        amount: 100,
        currency: 'XTR',
        provider: 'stars',
        subscription: true,
      });

      expect(result.provider).toBe('stars');
      expect(result.payUrl).toBe('https://t.me/$inv_stars');
      expect(result.providerInvoiceId).toBe('sub:premium:123');
    });

    it('should create invoice with Telegram Payments provider', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: 'https://t.me/$inv_tgp' }), { status: 200 })
      );

      const starspay = createStarsPay(configWithProviders);
      const result = await starspay.createProviderInvoice({
        title: 'Premium',
        description: 'Monthly premium',
        payload: 'purchase:item:456',
        amount: 999,
        currency: 'USD',
        provider: 'telegram_payments',
        needEmail: true,
      });

      expect(result.provider).toBe('telegram_payments');
      expect(result.payUrl).toBe('https://t.me/$inv_tgp');
      expect(result.providerInvoiceId).toBe('purchase:item:456');

      // Verify provider_token was passed to Telegram API
      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(callBody.provider_token).toBe('123456:TEST:ProviderToken');
      expect(callBody.need_email).toBe(true);
    });

    it('should throw when Telegram Payments provider has no providers configured', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createProviderInvoice({
        title: 'Item',
        description: 'An item',
        payload: 'purchase:item:789',
        amount: 999,
        currency: 'USD',
        provider: 'telegram_payments',
      })).rejects.toThrow('no providers configured');
    });

    it('should throw for unsupported provider', async () => {
      const starspay = createStarsPay(config);
      await expect(starspay.createProviderInvoice({
        title: 'Item',
        description: 'An item',
        payload: 'purchase:item:000',
        amount: 100,
        currency: 'BTC',
        provider: 'unknown_provider' as any,
      })).rejects.toThrow('unsupported provider "unknown_provider"');
    });
  });

  describe('refundPayment', () => {
    it('should refund via Stars provider', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
      );

      const starspay = createStarsPay(config);
      const result = await starspay.refundPayment({
        provider: 'stars',
        chargeId: 'charge_abc',
        telegramUserId: 12345,
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('stars');
      expect(result.refundId).toBe('charge_abc');
    });

    it('should return success: false for Telegram Payments refund (not supported via Telegram Bot API)', async () => {
      const starspay = createStarsPay(config);
      const result = await starspay.refundPayment({
        provider: 'telegram_payments',
        chargeId: 'ch_tgp_123',
        telegramUserId: 12345,
      });

      expect(result.success).toBe(false);
      expect(result.provider).toBe('telegram_payments');
    });
  });

  describe('currency guard', () => {
    it('should allow non-XTR payments when providers are configured', async () => {
      // Mock reportPayment backend call
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          payment: { id: 'pay_usd' },
          subscription: null,
        }), { status: 200 })
      );

      const onEvent = vi.fn();
      const starspay = createStarsPay({ ...configWithProviders, onEvent });

      await starspay.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: Date.now(),
          from: { id: 12345, first_name: 'Test' },
          chat: { id: 12345, type: 'private' },
          successful_payment: {
            currency: 'USD',
            total_amount: 999,
            invoice_payload: 'purchase:item:usd',
            telegram_payment_charge_id: 'charge_usd_1',
            provider_payment_charge_id: 'pi_tgp_1',
          },
        },
      });

      // The payment should have been processed (reported to backend)
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/v1/payments/report');
    });

    it('should reject non-XTR payments when no providers are configured', async () => {
      const onEvent = vi.fn();
      const starspay = createStarsPay({ ...config, onEvent, debug: true });

      // Capture console.log for the warning
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await starspay.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: Date.now(),
          from: { id: 12345, first_name: 'Test' },
          chat: { id: 12345, type: 'private' },
          successful_payment: {
            currency: 'USD',
            total_amount: 999,
            invoice_payload: 'purchase:item:usd',
            telegram_payment_charge_id: 'charge_usd_2',
            provider_payment_charge_id: 'pi_tgp_2',
          },
        },
      });

      // Payment should NOT have been reported — fetch should not have been called for payment reporting
      expect(onEvent).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('shipping_query handling', () => {
    it('should process shipping_query with handler and approve', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
      );

      const onShippingQuery = vi.fn().mockResolvedValue([
        { id: 'standard', title: 'Standard Shipping', prices: [{ label: 'Shipping', amount: 500 }] },
      ]);
      const starspay = createStarsPay({ ...config, onShippingQuery });

      await starspay.handleUpdate({
        update_id: 1,
        shipping_query: {
          id: 'sq_1',
          from: { id: 12345, first_name: 'Test', is_bot: false },
          invoice_payload: 'order:123',
          shipping_address: {
            country_code: 'US',
            state: 'CA',
            city: 'San Francisco',
            street_line1: '123 Main St',
            street_line2: '',
            post_code: '94105',
          },
        },
      });

      expect(onShippingQuery).toHaveBeenCalledWith({
        shippingQueryId: 'sq_1',
        userId: 12345,
        payload: 'order:123',
        shippingAddress: {
          country_code: 'US',
          state: 'CA',
          city: 'San Francisco',
          street_line1: '123 Main St',
          street_line2: '',
          post_code: '94105',
        },
      });

      // Should have called answerShippingQuery with ok=true
      expect(fetch).toHaveBeenCalledTimes(1);
      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(callBody.ok).toBe(true);
      expect(callBody.shipping_options).toEqual([
        { id: 'standard', title: 'Standard Shipping', prices: [{ label: 'Shipping', amount: 500 }] },
      ]);
    });

    it('should reject shipping_query when handler returns null', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
      );

      const onShippingQuery = vi.fn().mockResolvedValue(null);
      const starspay = createStarsPay({ ...config, onShippingQuery });

      await starspay.handleUpdate({
        update_id: 1,
        shipping_query: {
          id: 'sq_2',
          from: { id: 12345, first_name: 'Test', is_bot: false },
          invoice_payload: 'order:456',
          shipping_address: {
            country_code: 'RU',
            state: '',
            city: 'Moscow',
            street_line1: '1 Red Square',
            street_line2: '',
            post_code: '101000',
          },
        },
      });

      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(callBody.ok).toBe(false);
      expect(callBody.error_message).toBe('Shipping not available to this address');
    });

    it('should reject shipping_query when no handler is configured', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
      );

      const starspay = createStarsPay(config);

      await starspay.handleUpdate({
        update_id: 1,
        shipping_query: {
          id: 'sq_3',
          from: { id: 12345, first_name: 'Test', is_bot: false },
          invoice_payload: 'order:789',
          shipping_address: {
            country_code: 'US',
            state: 'NY',
            city: 'New York',
            street_line1: '456 Broadway',
            street_line2: 'Apt 2',
            post_code: '10013',
          },
        },
      });

      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(callBody.ok).toBe(false);
      expect(callBody.error_message).toBe('Shipping not configured');
    });
  });

});
