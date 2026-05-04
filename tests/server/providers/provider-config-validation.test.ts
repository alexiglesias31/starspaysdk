import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StarsProvider } from '../../../src/server/providers/stars';
import { TelegramPaymentsProvider } from '../../../src/server/providers/telegram-payments';
import type { TelegramPaymentsProviderConfig } from '../../../src/server/providers/telegram-payments';
import type { TelegramApiClient } from '../../../src/server/telegram-api';

function createMockTelegram() {
  return {
    createInvoiceLink: vi.fn<any>().mockResolvedValue('https://t.me/$invoice'),
    sendInvoice: vi.fn<any>().mockResolvedValue({ message_id: 1 }),
    refundStarPayment: vi.fn<any>().mockResolvedValue(true),
    editUserStarSubscription: vi.fn<any>().mockResolvedValue(true),
  } as unknown as TelegramApiClient;
}

describe('StarsProvider: error propagation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('propagates error from TelegramApiClient.createInvoiceLink', async () => {
    const telegram = createMockTelegram();
    vi.mocked(telegram.createInvoiceLink).mockRejectedValueOnce(new Error('Telegram API down'));

    const provider = new StarsProvider(telegram as unknown as TelegramApiClient);

    await expect(
      provider.createInvoice({
        title: 'Premium',
        description: 'Monthly',
        payload: 'sub:premium:1',
        amount: 100,
      })
    ).rejects.toThrow('Telegram API down');
  });

  it('propagates error from TelegramApiClient.sendInvoice', async () => {
    const telegram = createMockTelegram();
    vi.mocked(telegram.sendInvoice).mockRejectedValueOnce(new Error('Telegram sendInvoice failed'));

    const provider = new StarsProvider(telegram as unknown as TelegramApiClient);

    await expect(
      provider.sendInvoice(12345, {
        title: 'Item',
        description: 'A great item',
        payload: 'item:001',
        amount: 50,
      })
    ).rejects.toThrow('Telegram sendInvoice failed');
  });

  it('refund returns provider name "stars"', async () => {
    const telegram = createMockTelegram();
    const provider = new StarsProvider(telegram as unknown as TelegramApiClient);

    const result = await provider.refund(12345, 'charge_abc');
    expect(result.provider).toBe('stars');
  });
});

describe('TelegramPaymentsProvider: configuration edge cases', () => {
  let telegram: ReturnType<typeof createMockTelegram>;

  beforeEach(() => {
    telegram = createMockTelegram();
  });

  it('empty providerToken still calls createInvoiceLink (Telegram will reject)', async () => {
    const config: TelegramPaymentsProviderConfig = { providerToken: '' };
    const provider = new TelegramPaymentsProvider(telegram as unknown as TelegramApiClient, config);

    await provider.createInvoice({
      title: 'Test',
      description: 'Test plan',
      payload: 'sub:test:1',
      prices: [{ label: 'Test', amount: 100 }],
      currency: 'USD',
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({ provider_token: '' })
    );
  });

  it('testMode with testToken provided uses testToken', async () => {
    const config: TelegramPaymentsProviderConfig = {
      providerToken: 'live_token',
      testToken: 'test_token',
    };
    const provider = new TelegramPaymentsProvider(telegram as unknown as TelegramApiClient, config, true);

    await provider.createInvoice({
      title: 'Plan',
      description: 'Plan desc',
      payload: 'sub:plan:1',
      prices: [{ label: 'Plan', amount: 999 }],
      currency: 'USD',
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({ provider_token: 'test_token' })
    );
  });

  it('testMode without testToken falls back to providerToken', async () => {
    const config: TelegramPaymentsProviderConfig = { providerToken: 'live_only_token' };
    const provider = new TelegramPaymentsProvider(telegram as unknown as TelegramApiClient, config, true);

    await provider.createInvoice({
      title: 'Plan',
      description: 'Plan desc',
      payload: 'sub:plan:2',
      prices: [{ label: 'Plan', amount: 499 }],
      currency: 'EUR',
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({ provider_token: 'live_only_token' })
    );
  });

  it('refund returns provider name "telegram_payments"', async () => {
    const config: TelegramPaymentsProviderConfig = { providerToken: 'token' };
    const provider = new TelegramPaymentsProvider(telegram as unknown as TelegramApiClient, config);

    const result = await provider.refund(12345, 'charge_abc');
    expect(result.provider).toBe('telegram_payments');
  });
});
