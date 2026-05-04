import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import { createStarsPay } from '../../src/server/middleware';

// ── Shared config (testMode avoids NODE_ENV/apiUrl guards) ───────────────────

const BASE_CONFIG = {
  apiKey: 'sp_test_123',
  botToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
  apiUrl: 'http://localhost:54321',
  testMode: true as const,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCryptoSignature(body: string, token: string): string {
  const secret = createHash('sha256').update(token).digest();
  return createHmac('sha256', secret).update(body).digest('hex');
}

function makeWalletSignature(
  method: string,
  uriPath: string,
  timestamp: string,
  bodyString: string,
  key: string
): string {
  const bodyBase64 = Buffer.from(bodyString).toString('base64');
  const message = `${method}.${uriPath}.${timestamp}.${bodyBase64}`;
  return createHmac('sha256', key).update(message).digest('base64');
}

// ── Stars provider flow ───────────────────────────────────────────────────────

describe('Stars provider flow through middleware', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createProviderInvoice with stars creates a Stars invoice link', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: 'https://t.me/$stars_inv' }), { status: 200 })
    );

    const starspay = createStarsPay(BASE_CONFIG);
    const result = await starspay.createProviderInvoice({
      provider: 'stars',
      title: 'Premium',
      description: 'Monthly premium',
      payload: 'sub:premium:999',
      amount: 100,
      currency: 'XTR',
    });

    expect(result.provider).toBe('stars');
    expect(result.payUrl).toBe('https://t.me/$stars_inv');

    // TelegramApiClient should have called createInvoiceLink with XTR currency
    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.currency).toBe('XTR');
    expect(callBody.payload).toBe('sub:premium:999');
  });

  it('createProviderInvoice with stars rejects invalid amount', async () => {
    const starspay = createStarsPay(BASE_CONFIG);

    await expect(
      starspay.createProviderInvoice({
        provider: 'stars',
        title: 'Premium',
        description: 'Monthly',
        payload: 'sub:premium:1',
        amount: 0,
        currency: 'XTR',
      })
    ).rejects.toThrow('invalid Stars amount');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('handleUpdate accepts XTR payment when processed', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, subscriptionId: 'sub_1' }), { status: 200 })
      );

    const onEvent = vi.fn();
    const starspay = createStarsPay({ ...BASE_CONFIG, onEvent });

    await starspay.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 12345, first_name: 'Test', is_bot: false },
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        successful_payment: {
          currency: 'XTR',
          total_amount: 100,
          invoice_payload: 'sub:premium:12345',
          telegram_payment_charge_id: 'charge_xtr_1',
          provider_payment_charge_id: 'provider_xtr_1',
          is_recurring: true,
          is_first_recurring: true,
          subscription_expiration_date: Math.floor(Date.now() / 1000) + 2592000,
        },
      },
    });

    expect(onEvent).toHaveBeenCalledWith(
      'subscription.created',
      expect.objectContaining({ telegramUserId: 12345 })
    );
  });
});

// ── Telegram Payments provider flow ──────────────────────────────────────────

describe('Telegram Payments provider flow through middleware', () => {
  const telegramPaymentsConfig = {
    ...BASE_CONFIG,
    payments: {
      providers: {
        telegram_payments: { token: 'tgp_live_token', testToken: 'tgp_test_token' },
      },
    },
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createProviderInvoice with telegram_payments uses provider_token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: 'https://t.me/$tgp_inv' }), { status: 200 })
    );

    const starspay = createStarsPay(telegramPaymentsConfig);
    const result = await starspay.createProviderInvoice({
      provider: 'telegram_payments',
      title: 'Pro Plan',
      description: 'Annual pro plan',
      payload: 'sub:pro:789',
      amount: 9999,
      currency: 'USD',
    });

    expect(result.provider).toBe('telegram_payments');
    expect(result.payUrl).toBe('https://t.me/$tgp_inv');

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    // testMode is true — should use testToken
    expect(callBody.provider_token).toBe('tgp_test_token');
    expect(callBody.currency).toBe('USD');
  });

  it('createProviderInvoice with telegram_payments throws when no providers configured', async () => {
    const starspay = createStarsPay(BASE_CONFIG); // no payments.providers

    await expect(
      starspay.createProviderInvoice({
        provider: 'telegram_payments',
        title: 'Plan',
        description: 'Plan desc',
        payload: 'sub:plan:1',
        amount: 999,
        currency: 'USD',
      })
    ).rejects.toThrow('no providers configured');
  });

  it('handleUpdate accepts USD payment when providers configured', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const onEvent = vi.fn();
    const starspay = createStarsPay({ ...telegramPaymentsConfig, onEvent });

    await starspay.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        from: { id: 55555, first_name: 'User', is_bot: false },
        date: Date.now(),
        chat: { id: 55555, type: 'private' },
        successful_payment: {
          currency: 'USD',
          total_amount: 999,
          invoice_payload: 'sub:pro:55555',
          telegram_payment_charge_id: 'charge_usd_1',
          provider_payment_charge_id: 'provider_usd_1',
        },
      },
    });

    expect(onEvent).toHaveBeenCalledWith(
      'payment.one_time',
      expect.objectContaining({ telegramUserId: 55555, amount: 999 })
    );
  });

  it('handleUpdate skips USD payment when no providers configured', async () => {
    const onEvent = vi.fn();
    const starspay = createStarsPay({ ...BASE_CONFIG, onEvent });

    await starspay.handleUpdate({
      update_id: 3,
      message: {
        message_id: 3,
        from: { id: 44444, first_name: 'User', is_bot: false },
        date: Date.now(),
        chat: { id: 44444, type: 'private' },
        successful_payment: {
          currency: 'USD',
          total_amount: 999,
          invoice_payload: 'sub:pro:44444',
          telegram_payment_charge_id: 'charge_usd_2',
          provider_payment_charge_id: 'provider_usd_2',
        },
      },
    });

    // Should not fire onEvent — USD without providers is skipped
    expect(onEvent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
