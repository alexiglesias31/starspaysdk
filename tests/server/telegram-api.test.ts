import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramApiClient, TelegramApiError } from '../../src/server/telegram-api';

describe('TelegramApiClient', () => {
  let client: TelegramApiClient;
  const BOT_TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';

  beforeEach(() => {
    client = new TelegramApiClient(BOT_TOKEN);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call getMe', async () => {
    const mockResponse = {
      ok: true,
      result: {
        id: 123,
        is_bot: true,
        first_name: 'TestBot',
        username: 'test_bot',
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await client.getMe();

    expect(result.id).toBe(123);
    expect(result.username).toBe('test_bot');
    expect(fetch).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${BOT_TOKEN}/getMe`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should call answerPreCheckoutQuery with ok=true', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    const result = await client.answerPreCheckoutQuery('query_123', true);

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('answerPreCheckoutQuery'),
      expect.objectContaining({
        body: JSON.stringify({
          pre_checkout_query_id: 'query_123',
          ok: true,
        }),
      })
    );
  });

  it('should call answerPreCheckoutQuery with error message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    await client.answerPreCheckoutQuery('query_123', false, 'Out of stock');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('answerPreCheckoutQuery'),
      expect.objectContaining({
        body: JSON.stringify({
          pre_checkout_query_id: 'query_123',
          ok: false,
          error_message: 'Out of stock',
        }),
      })
    );
  });

  it('should create invoice link with Stars params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: 'https://t.me/$invoice_123' }), { status: 200 })
    );

    const result = await client.createInvoiceLink({
      title: 'Premium',
      description: 'Monthly subscription',
      payload: 'sub:premium:123',
      prices: [{ label: 'Premium', amount: 100 }],
      subscription_period: 2592000,
    });

    expect(result).toBe('https://t.me/$invoice_123');
    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.currency).toBe('XTR');
    expect(callBody.provider_token).toBe('');
    expect(callBody.subscription_period).toBe(2592000);
  });

  it('should call editUserStarSubscription', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    await client.editUserStarSubscription(12345, 'charge_123', true);

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.user_id).toBe(12345);
    expect(callBody.telegram_payment_charge_id).toBe('charge_123');
    expect(callBody.is_canceled).toBe(true);
  });

  it('should call refundStarPayment', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    await client.refundStarPayment(12345, 'charge_123');

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.user_id).toBe(12345);
    expect(callBody.telegram_payment_charge_id).toBe('charge_123');
  });

  it('should throw TelegramApiError on API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, description: 'Unauthorized', error_code: 401 }),
        { status: 200 }
      )
    );

    await expect(client.getMe()).rejects.toThrow(TelegramApiError);
    await expect(
      (async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
          new Response(
            JSON.stringify({ ok: false, description: 'Unauthorized', error_code: 401 }),
            { status: 200 }
          )
        );
        await client.getMe();
      })()
    ).rejects.toThrow('Unauthorized');
  });

  it('should send a message with inline keyboard', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 })
    );

    await client.sendMessage(12345, 'Hello *world*', {
      parseMode: 'Markdown',
      replyMarkup: {
        inline_keyboard: [[{ text: 'Buy', url: 'https://t.me/$inv_1' }]],
      },
    });

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.chat_id).toBe(12345);
    expect(callBody.text).toBe('Hello *world*');
    expect(callBody.parse_mode).toBe('Markdown');
    expect(callBody.reply_markup.inline_keyboard[0][0].text).toBe('Buy');
  });

  it('should send a plain message without options', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 43 } }), { status: 200 })
    );

    await client.sendMessage(12345, 'Simple message');

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.chat_id).toBe(12345);
    expect(callBody.text).toBe('Simple message');
    expect(callBody.parse_mode).toBeUndefined();
    expect(callBody.reply_markup).toBeUndefined();
  });

  it('should get star transactions with pagination', async () => {
    const mockTransactions = {
      ok: true,
      result: {
        transactions: [
          { id: 'tx_1', amount: 100, date: 1234567890 },
          { id: 'tx_2', amount: 50, date: 1234567800 },
        ],
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockTransactions), { status: 200 })
    );

    const result = await client.getStarTransactions(0, 50);

    expect(result.transactions).toHaveLength(2);
    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.offset).toBe(0);
    expect(callBody.limit).toBe(50);
  });

  // ── Channel membership management ──

  it('should create chat invite link with join request gating', async () => {
    const mockLink = {
      invite_link: 'https://t.me/+abc123',
      creator: { id: 123, is_bot: true, first_name: 'Bot' },
      creates_join_request: true,
      is_primary: false,
      is_revoked: false,
      name: 'membership_456',
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: mockLink }), { status: 200 })
    );

    const result = await client.createChatInviteLink({
      chat_id: -1001234567890,
      creates_join_request: true,
      name: 'membership_456',
    });

    expect(result.invite_link).toBe('https://t.me/+abc123');
    expect(result.creates_join_request).toBe(true);
    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.chat_id).toBe(-1001234567890);
    expect(callBody.creates_join_request).toBe(true);
    expect(callBody.name).toBe('membership_456');
    expect(callBody.member_limit).toBeUndefined();
  });

  it('should approve a chat join request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    const result = await client.approveChatJoinRequest(-1001234567890, 456);

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('approveChatJoinRequest'),
      expect.objectContaining({
        body: JSON.stringify({ chat_id: -1001234567890, user_id: 456 }),
      })
    );
  });

  it('should decline a chat join request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    const result = await client.declineChatJoinRequest(-1001234567890, 456);

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('declineChatJoinRequest'),
      expect.objectContaining({
        body: JSON.stringify({ chat_id: -1001234567890, user_id: 456 }),
      })
    );
  });

  it('should ban a chat member', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    const result = await client.banChatMember(-1001234567890, 456, false);

    expect(result).toBe(true);
    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.chat_id).toBe(-1001234567890);
    expect(callBody.user_id).toBe(456);
    expect(callBody.revoke_messages).toBe(false);
  });

  it('should ban a chat member without revokeMessages param', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    await client.banChatMember(-1001234567890, 456);

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.chat_id).toBe(-1001234567890);
    expect(callBody.user_id).toBe(456);
    expect(callBody.revoke_messages).toBeUndefined();
  });

  it('should unban a chat member with only_if_banned', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    const result = await client.unbanChatMember(-1001234567890, 456);

    expect(result).toBe(true);
    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.chat_id).toBe(-1001234567890);
    expect(callBody.user_id).toBe(456);
    expect(callBody.only_if_banned).toBe(true);
  });

  it('should get chat member status', async () => {
    const mockMember = {
      status: 'member',
      user: { id: 456, is_bot: false, first_name: 'TestUser' },
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: mockMember }), { status: 200 })
    );

    const result = await client.getChatMember(-1001234567890, 456);

    expect(result.status).toBe('member');
    expect(result.user.id).toBe(456);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('getChatMember'),
      expect.objectContaining({
        body: JSON.stringify({ chat_id: -1001234567890, user_id: 456 }),
      })
    );
  });

  // ── Provider payment extensions ──

  it('createInvoiceLink defaults to Stars behavior when no provider params given', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: 'https://t.me/$invoice_stars' }), { status: 200 })
    );

    const result = await client.createInvoiceLink({
      title: 'Premium',
      description: 'Monthly subscription',
      payload: 'sub:premium:123',
      prices: [{ label: 'Premium', amount: 100 }],
    });

    expect(result).toBe('https://t.me/$invoice_stars');
    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.currency).toBe('XTR');
    expect(callBody.provider_token).toBe('');
  });

  it('createInvoiceLink passes through provider_token and currency when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: 'https://t.me/$invoice_tgp' }), { status: 200 })
    );

    await client.createInvoiceLink({
      title: 'Pro Plan',
      description: 'Annual subscription',
      payload: 'sub:pro:456',
      prices: [{ label: 'Pro Plan', amount: 999 }],
      provider_token: 'tgp_test_token_abc',
      currency: 'USD',
      need_email: true,
      provider_data: '{"receipt_email":"user@example.com"}',
    });

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.currency).toBe('USD');
    expect(callBody.provider_token).toBe('tgp_test_token_abc');
    expect(callBody.need_email).toBe(true);
    expect(callBody.provider_data).toBe('{"receipt_email":"user@example.com"}');
  });

  it('sendInvoice defaults to Stars behavior when no provider params given', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 10 } }), { status: 200 })
    );

    await client.sendInvoice({
      chat_id: 12345,
      title: 'One-time purchase',
      description: 'Buy item',
      payload: 'item:001',
      prices: [{ label: 'Item', amount: 50 }],
    });

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.currency).toBe('XTR');
    expect(callBody.provider_token).toBe('');
  });

  it('sendInvoice passes through provider_token and currency when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 11 } }), { status: 200 })
    );

    await client.sendInvoice({
      chat_id: 12345,
      title: 'Premium Item',
      description: 'Buy premium item',
      payload: 'item:premium',
      prices: [{ label: 'Premium Item', amount: 1999 }],
      provider_token: 'tgp_live_token_xyz',
      currency: 'EUR',
      need_name: true,
      need_shipping_address: true,
      is_flexible: true,
    });

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.currency).toBe('EUR');
    expect(callBody.provider_token).toBe('tgp_live_token_xyz');
    expect(callBody.need_name).toBe(true);
    expect(callBody.need_shipping_address).toBe(true);
    expect(callBody.is_flexible).toBe(true);
  });

  it('answerShippingQuery calls API with ok=true and shipping options', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    const shippingOptions = [
      { id: 'standard', title: 'Standard Shipping', prices: [{ label: 'Standard', amount: 500 }] },
      { id: 'express', title: 'Express Shipping', prices: [{ label: 'Express', amount: 1200 }] },
    ];

    const result = await client.answerShippingQuery('shipping_query_abc', true, shippingOptions);

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('answerShippingQuery'),
      expect.any(Object)
    );
    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.shipping_query_id).toBe('shipping_query_abc');
    expect(callBody.ok).toBe(true);
    expect(callBody.shipping_options).toEqual(shippingOptions);
    expect(callBody.error_message).toBeUndefined();
  });

  it('answerShippingQuery calls API with ok=false and error message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
    );

    await client.answerShippingQuery('shipping_query_xyz', false, undefined, 'Cannot ship to this address');

    const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(callBody.shipping_query_id).toBe('shipping_query_xyz');
    expect(callBody.ok).toBe(false);
    expect(callBody.error_message).toBe('Cannot ship to this address');
    expect(callBody.shipping_options).toBeUndefined();
  });
});
