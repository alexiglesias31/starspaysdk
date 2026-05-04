import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramPaymentsProvider } from '../../../src/server/providers/telegram-payments';
import type { TelegramPaymentsProviderConfig } from '../../../src/server/providers/telegram-payments';
import type { TelegramApiClient } from '../../../src/server/telegram-api';

function createMockTelegram() {
  return {
    createInvoiceLink: vi.fn<any>().mockResolvedValue('https://t.me/$invoice_tgp'),
    sendInvoice: vi.fn<any>().mockResolvedValue({ message_id: 1 }),
  } as unknown as TelegramApiClient;
}

const LIVE_TOKEN = '123456:LIVE:AbCdEfGhIjKlMn';
const TEST_TOKEN = '123456:TEST:ZyXwVuTsRq';

describe('TelegramPaymentsProvider', () => {
  let provider: TelegramPaymentsProvider;
  let telegram: ReturnType<typeof createMockTelegram>;
  const config: TelegramPaymentsProviderConfig = {
    providerToken: LIVE_TOKEN,
    testToken: TEST_TOKEN,
  };

  beforeEach(() => {
    telegram = createMockTelegram();
    provider = new TelegramPaymentsProvider(telegram as unknown as TelegramApiClient, config);
  });

  it('has name "telegram_payments"', () => {
    expect(provider.name).toBe('telegram_payments');
  });

  // ── Test mode ──

  it('uses providerToken by default (production mode)', async () => {
    await provider.createInvoice({
      title: 'Pro Plan',
      description: 'Annual plan',
      payload: 'sub:pro:123',
      prices: [{ label: 'Pro Plan', amount: 9999 }],
      currency: 'USD',
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_token: LIVE_TOKEN,
      })
    );
  });

  it('uses testToken in test mode', async () => {
    const testProvider = new TelegramPaymentsProvider(
      telegram as unknown as TelegramApiClient,
      config,
      true
    );

    await testProvider.createInvoice({
      title: 'Pro Plan',
      description: 'Annual plan',
      payload: 'sub:pro:123',
      prices: [{ label: 'Pro Plan', amount: 9999 }],
      currency: 'USD',
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_token: TEST_TOKEN,
      })
    );
  });

  it('falls back to providerToken when testMode=true but testToken is not set', async () => {
    const configNoTest: TelegramPaymentsProviderConfig = { providerToken: LIVE_TOKEN };
    const fallbackProvider = new TelegramPaymentsProvider(
      telegram as unknown as TelegramApiClient,
      configNoTest,
      true
    );

    await fallbackProvider.createInvoice({
      title: 'Item',
      description: 'An item',
      payload: 'item:001',
      prices: [{ label: 'Item', amount: 500 }],
      currency: 'EUR',
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_token: LIVE_TOKEN,
      })
    );
  });

  // ── createInvoice ──

  it('createInvoice passes provider_token and fiat currency', async () => {
    const result = await provider.createInvoice({
      title: 'Premium',
      description: 'Monthly premium',
      payload: 'sub:premium:456',
      prices: [{ label: 'Premium', amount: 999 }],
      currency: 'USD',
    });

    expect(result.provider).toBe('telegram_payments');
    expect(result.payUrl).toBe('https://t.me/$invoice_tgp');
    expect(result.providerInvoiceId).toBe('sub:premium:456');

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_token: LIVE_TOKEN,
        currency: 'USD',
        title: 'Premium',
        description: 'Monthly premium',
        payload: 'sub:premium:456',
        prices: [{ label: 'Premium', amount: 999 }],
      })
    );
  });

  it('createInvoice passes Telegram Payments-specific params (needName, needEmail, etc.)', async () => {
    await provider.createInvoice({
      title: 'Pro',
      description: 'Pro plan',
      payload: 'sub:pro:789',
      prices: [{ label: 'Pro', amount: 2999 }],
      currency: 'USD',
      needName: true,
      needEmail: true,
      needPhoneNumber: true,
      needShippingAddress: true,
      isFlexible: true,
      sendPhoneNumberToProvider: true,
      sendEmailToProvider: true,
      providerData: '{"receipt_email":"user@example.com"}',
      maxTipAmount: 500,
      suggestedTipAmounts: [100, 200, 300, 500],
      photoUrl: 'https://example.com/pro.jpg',
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        need_name: true,
        need_email: true,
        need_phone_number: true,
        need_shipping_address: true,
        is_flexible: true,
        send_phone_number_to_provider: true,
        send_email_to_provider: true,
        provider_data: '{"receipt_email":"user@example.com"}',
        max_tip_amount: 500,
        suggested_tip_amounts: [100, 200, 300, 500],
        photo_url: 'https://example.com/pro.jpg',
      })
    );
  });

  it('createInvoice does NOT pass subscription_period (Stars-only)', async () => {
    await provider.createInvoice({
      title: 'Plan',
      description: 'Subscription',
      payload: 'sub:plan:001',
      prices: [{ label: 'Plan', amount: 1499 }],
      currency: 'USD',
    });

    const callArgs = vi.mocked(telegram.createInvoiceLink).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('subscription_period');
  });

  it('createInvoice omits optional params when not provided', async () => {
    await provider.createInvoice({
      title: 'Basic',
      description: 'Basic plan',
      payload: 'sub:basic:001',
      prices: [{ label: 'Basic', amount: 499 }],
      currency: 'EUR',
    });

    const callArgs = vi.mocked(telegram.createInvoiceLink).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('need_name');
    expect(callArgs).not.toHaveProperty('need_email');
    expect(callArgs).not.toHaveProperty('need_phone_number');
    expect(callArgs).not.toHaveProperty('need_shipping_address');
    expect(callArgs).not.toHaveProperty('is_flexible');
    expect(callArgs).not.toHaveProperty('provider_data');
    expect(callArgs).not.toHaveProperty('max_tip_amount');
    expect(callArgs).not.toHaveProperty('suggested_tip_amounts');
    expect(callArgs).not.toHaveProperty('photo_url');
  });

  // ── sendInvoice ──

  it('sendInvoice passes provider_token and currency', async () => {
    const result = await provider.sendInvoice(12345, {
      title: 'Item',
      description: 'Buy this item',
      payload: 'item:002',
      prices: [{ label: 'Item', amount: 750 }],
      currency: 'GBP',
    });

    expect(result.provider).toBe('telegram_payments');
    expect(result.payUrl).toBe('');
    expect(result.providerInvoiceId).toBe('item:002');

    expect(telegram.sendInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 12345,
        provider_token: LIVE_TOKEN,
        currency: 'GBP',
        title: 'Item',
        description: 'Buy this item',
        payload: 'item:002',
        prices: [{ label: 'Item', amount: 750 }],
      })
    );
  });

  it('sendInvoice passes Telegram Payments-specific params', async () => {
    await provider.sendInvoice(67890, {
      title: 'Premium Item',
      description: 'A premium item',
      payload: 'item:003',
      prices: [{ label: 'Premium Item', amount: 1999 }],
      currency: 'USD',
      needName: true,
      needEmail: true,
      isFlexible: true,
      providerData: '{"metadata":"test"}',
      maxTipAmount: 1000,
      suggestedTipAmounts: [200, 500, 1000],
      photoUrl: 'https://example.com/item.png',
    });

    expect(telegram.sendInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        need_name: true,
        need_email: true,
        is_flexible: true,
        provider_data: '{"metadata":"test"}',
        max_tip_amount: 1000,
        suggested_tip_amounts: [200, 500, 1000],
        photo_url: 'https://example.com/item.png',
      })
    );
  });

  // ── refund ──

  it('refund returns success: false (external refund required)', async () => {
    const result = await provider.refund(12345, 'ch_abc');

    expect(result.success).toBe(false);
    expect(result.provider).toBe('telegram_payments');
    expect(result.refundId).toBeUndefined();
  });
});
