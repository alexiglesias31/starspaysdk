import { describe, it, expect } from 'vitest';
import { parseWebhookUpdate, isPaymentUpdate } from '../../src/server/webhook';
import type { TelegramUpdate } from '../../src/types/telegram';

describe('parseWebhookUpdate', () => {
  it('should parse pre_checkout_query', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      pre_checkout_query: {
        id: 'pchk_123',
        from: { id: 12345, first_name: 'Test', is_bot: false },
        currency: 'XTR',
        total_amount: 100,
        invoice_payload: 'sub:premium:12345',
      },
    };

    const result = parseWebhookUpdate(update);

    expect(result.type).toBe('pre_checkout');
    expect(result.preCheckoutQuery).toBeDefined();
    expect(result.preCheckoutQuery?.id).toBe('pchk_123');
    expect(result.telegramUserId).toBe(12345);
    expect(result.paymentType).toBeNull();
  });

  it('should parse one-time successful payment', () => {
    const update: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 1,
        from: { id: 12345, first_name: 'Test', is_bot: false },
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        successful_payment: {
          currency: 'XTR',
          total_amount: 50,
          invoice_payload: 'purchase:item1:12345',
          telegram_payment_charge_id: 'charge_abc',
          provider_payment_charge_id: 'provider_abc',
        },
      },
    };

    const result = parseWebhookUpdate(update);

    expect(result.type).toBe('payment.one_time');
    expect(result.paymentType).toBe('one_time');
    expect(result.successfulPayment).toBeDefined();
    expect(result.successfulPayment?.total_amount).toBe(50);
    expect(result.telegramUserId).toBe(12345);
  });

  it('should parse initial subscription payment (is_first_recurring)', () => {
    const update: TelegramUpdate = {
      update_id: 3,
      message: {
        message_id: 2,
        from: { id: 12345, first_name: 'Test', is_bot: false },
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        successful_payment: {
          currency: 'XTR',
          total_amount: 100,
          invoice_payload: 'sub:premium:12345',
          telegram_payment_charge_id: 'charge_sub_1',
          provider_payment_charge_id: 'provider_sub_1',
          subscription_expiration_date: Math.floor(Date.now() / 1000) + 2592000,
          is_recurring: true,
          is_first_recurring: true,
        },
      },
    };

    const result = parseWebhookUpdate(update);

    expect(result.type).toBe('payment.subscription_initial');
    expect(result.paymentType).toBe('subscription_initial');
    expect(result.successfulPayment?.is_recurring).toBe(true);
    expect(result.successfulPayment?.is_first_recurring).toBe(true);
  });

  it('should parse subscription renewal payment', () => {
    const update: TelegramUpdate = {
      update_id: 4,
      message: {
        message_id: 3,
        from: { id: 12345, first_name: 'Test', is_bot: false },
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        successful_payment: {
          currency: 'XTR',
          total_amount: 100,
          invoice_payload: 'sub:premium:12345',
          telegram_payment_charge_id: 'charge_renewal_1',
          provider_payment_charge_id: 'provider_renewal_1',
          subscription_expiration_date: Math.floor(Date.now() / 1000) + 2592000,
          is_recurring: true,
        },
      },
    };

    const result = parseWebhookUpdate(update);

    expect(result.type).toBe('payment.subscription_renewal');
    expect(result.paymentType).toBe('subscription_renewal');
  });

  it('should parse refunded payment', () => {
    const update: TelegramUpdate = {
      update_id: 5,
      message: {
        message_id: 4,
        from: { id: 12345, first_name: 'Test', is_bot: false },
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        refunded_payment: {
          currency: 'XTR',
          total_amount: 50,
          invoice_payload: 'purchase:item1:12345',
          telegram_payment_charge_id: 'charge_abc',
        },
      },
    };

    const result = parseWebhookUpdate(update);

    expect(result.type).toBe('payment.refunded');
    expect(result.refundedPayment).toBeDefined();
    expect(result.refundedPayment?.total_amount).toBe(50);
  });

  it('should return unknown for non-payment updates', () => {
    const update: TelegramUpdate = {
      update_id: 6,
      message: {
        message_id: 5,
        from: { id: 12345, first_name: 'Test', is_bot: false },
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
      },
    };

    const result = parseWebhookUpdate(update);

    expect(result.type).toBe('unknown');
    expect(result.paymentType).toBeNull();
    expect(result.telegramUserId).toBeNull();
  });
});

describe('isPaymentUpdate', () => {
  it('should return true for pre_checkout_query', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      pre_checkout_query: {
        id: 'test',
        from: { id: 1, first_name: 'Test', is_bot: false },
        currency: 'XTR',
        total_amount: 100,
        invoice_payload: 'test',
      },
    };
    expect(isPaymentUpdate(update)).toBe(true);
  });

  it('should return true for successful_payment', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        date: Date.now(),
        chat: { id: 1, type: 'private' },
        successful_payment: {
          currency: 'XTR',
          total_amount: 100,
          invoice_payload: 'test',
          telegram_payment_charge_id: 'ch_1',
          provider_payment_charge_id: 'p_1',
        },
      },
    };
    expect(isPaymentUpdate(update)).toBe(true);
  });

  it('should return true for refunded_payment', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        date: Date.now(),
        chat: { id: 1, type: 'private' },
        refunded_payment: {
          currency: 'XTR',
          total_amount: 100,
          invoice_payload: 'test',
          telegram_payment_charge_id: 'ch_1',
        },
      },
    };
    expect(isPaymentUpdate(update)).toBe(true);
  });

  it('should return false for regular message', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        date: Date.now(),
        chat: { id: 1, type: 'private' },
      },
    };
    expect(isPaymentUpdate(update)).toBe(false);
  });

  it('should return false for update without message', () => {
    const update: TelegramUpdate = { update_id: 1 };
    expect(isPaymentUpdate(update)).toBe(false);
  });

  it('should return true for shipping_query', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      shipping_query: {
        id: 'sq_1',
        from: { id: 42, is_bot: false, first_name: 'Test' },
        invoice_payload: 'test_payload',
        shipping_address: {
          country_code: 'US',
          state: 'CA',
          city: 'SF',
          street_line1: '123 Main',
          street_line2: '',
          post_code: '94102',
        },
      },
    };
    expect(isPaymentUpdate(update)).toBe(true);
  });
});

describe('shipping_query parsing', () => {
  it('parses shipping_query update correctly', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      shipping_query: {
        id: 'sq123',
        from: { id: 42, is_bot: false, first_name: 'Test' },
        invoice_payload: 'test_payload',
        shipping_address: {
          country_code: 'US',
          state: 'CA',
          city: 'SF',
          street_line1: '123 Main',
          street_line2: '',
          post_code: '94102',
        },
      },
    };
    const event = parseWebhookUpdate(update);
    expect(event.type).toBe('shipping_query');
    expect(event.shippingQuery).toBeDefined();
    expect(event.shippingQuery?.id).toBe('sq123');
    expect(event.telegramUserId).toBe(42);
    expect(event.paymentType).toBeNull();
  });

  it('returns null successfulPayment and refundedPayment for shipping_query', () => {
    const update: TelegramUpdate = {
      update_id: 2,
      shipping_query: {
        id: 'sq456',
        from: { id: 99, is_bot: false, first_name: 'User' },
        invoice_payload: 'payload_sq',
        shipping_address: {
          country_code: 'DE',
          state: '',
          city: 'Berlin',
          street_line1: 'Unter den Linden 1',
          street_line2: '',
          post_code: '10117',
        },
      },
    };
    const event = parseWebhookUpdate(update);
    expect(event.successfulPayment).toBeNull();
    expect(event.refundedPayment).toBeNull();
    expect(event.preCheckoutQuery).toBeNull();
  });
});
