import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StarsProvider } from '../../../src/server/providers/stars';
import type { TelegramApiClient } from '../../../src/server/telegram-api';
import { SUBSCRIPTION_PERIOD_SECONDS } from '../../../src/types/config';

function createMockTelegram() {
  return {
    createInvoiceLink: vi.fn<any>().mockResolvedValue('https://t.me/$invoice_stars'),
    sendInvoice: vi.fn<any>().mockResolvedValue({ message_id: 1 }),
    refundStarPayment: vi.fn<any>().mockResolvedValue(true),
    editUserStarSubscription: vi.fn<any>().mockResolvedValue(true),
  } as unknown as TelegramApiClient;
}

describe('StarsProvider', () => {
  let provider: StarsProvider;
  let telegram: ReturnType<typeof createMockTelegram>;

  beforeEach(() => {
    telegram = createMockTelegram();
    provider = new StarsProvider(telegram as unknown as TelegramApiClient);
  });

  it('has name "stars"', () => {
    expect(provider.name).toBe('stars');
  });

  // ── createInvoice ──

  it('createInvoice calls telegram.createInvoiceLink with correct params', async () => {
    const result = await provider.createInvoice({
      title: 'Premium',
      description: 'Monthly subscription',
      payload: 'sub:premium:123',
      amount: 100,
    });

    expect(result.provider).toBe('stars');
    expect(result.payUrl).toBe('https://t.me/$invoice_stars');
    expect(result.providerInvoiceId).toBe('sub:premium:123');

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith({
      title: 'Premium',
      description: 'Monthly subscription',
      payload: 'sub:premium:123',
      prices: [{ label: 'Premium', amount: 100 }],
    });
  });

  it('createInvoice passes subscription_period when subscription is true', async () => {
    await provider.createInvoice({
      title: 'Premium',
      description: 'Monthly subscription',
      payload: 'sub:premium:123',
      amount: 100,
      subscription: true,
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_period: SUBSCRIPTION_PERIOD_SECONDS,
      })
    );
  });

  it('createInvoice does NOT pass subscription_period when subscription is false', async () => {
    await provider.createInvoice({
      title: 'Item',
      description: 'One-time purchase',
      payload: 'item:001',
      amount: 50,
      subscription: false,
    });

    const callArgs = vi.mocked(telegram.createInvoiceLink).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('subscription_period');
  });

  it('createInvoice passes photo_url when photoUrl is provided', async () => {
    await provider.createInvoice({
      title: 'Item',
      description: 'An item',
      payload: 'item:002',
      amount: 25,
      photoUrl: 'https://example.com/photo.jpg',
    });

    expect(telegram.createInvoiceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        photo_url: 'https://example.com/photo.jpg',
      })
    );
  });

  // ── sendInvoice ──

  it('sendInvoice calls telegram.sendInvoice with correct params', async () => {
    const result = await provider.sendInvoice(12345, {
      title: 'Item',
      description: 'Buy this item',
      payload: 'item:003',
      amount: 75,
    });

    expect(result.provider).toBe('stars');
    expect(result.payUrl).toBe('');
    expect(result.providerInvoiceId).toBe('item:003');

    expect(telegram.sendInvoice).toHaveBeenCalledWith({
      chat_id: 12345,
      title: 'Item',
      description: 'Buy this item',
      payload: 'item:003',
      prices: [{ label: 'Item', amount: 75 }],
    });
  });

  it('sendInvoice passes photo_url when photoUrl is provided', async () => {
    await provider.sendInvoice(12345, {
      title: 'Item',
      description: 'An item',
      payload: 'item:004',
      amount: 30,
      photoUrl: 'https://example.com/item.png',
    });

    expect(telegram.sendInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        photo_url: 'https://example.com/item.png',
      })
    );
  });

  // ── refund ──

  it('refund calls telegram.refundStarPayment and returns success', async () => {
    const result = await provider.refund(12345, 'charge_abc');

    expect(result.success).toBe(true);
    expect(result.refundId).toBe('charge_abc');
    expect(result.provider).toBe('stars');
    expect(telegram.refundStarPayment).toHaveBeenCalledWith(12345, 'charge_abc');
  });

  it('refund returns success: false when telegram API throws', async () => {
    vi.mocked(telegram.refundStarPayment).mockRejectedValueOnce(new Error('Refund failed'));

    const result = await provider.refund(12345, 'charge_fail');

    expect(result.success).toBe(false);
    expect(result.provider).toBe('stars');
    expect(result.refundId).toBeUndefined();
  });

  // ── cancelSubscription ──

  it('cancelSubscription calls telegram.editUserStarSubscription with isCanceled=true', async () => {
    await provider.cancelSubscription(12345, 'charge_sub');

    expect(telegram.editUserStarSubscription).toHaveBeenCalledWith(12345, 'charge_sub', true);
  });
});
