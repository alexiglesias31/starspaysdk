/**
 * Telegram Payments provider journeys (6, 7).
 */
import { test, expect } from '@playwright/test';
import { makeSuccessfulPaymentUpdate } from '../lib/webhook-payloads.ts';

const HARNESS = 'http://127.0.0.1:4173';
const WEBHOOK_SECRET = 'harness-secret';

test.describe('Telegram Payments provider', () => {
  test.beforeEach(async ({ request }) => { await request.post(`${HARNESS}/__test/reset`); });

  test('journey 6: createProviderInvoice telegram_payments returns provider invoice with provider_token applied', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '6 — TG Payments invoice creation' });
    const res = await request.post(`${HARNESS}/api/createProviderInvoice`, {
      data: {
        provider: 'telegram_payments',
        title: 'Premium',
        description: 'Monthly premium',
        payload: 'tgp:6:user',
        amount: 999,
        currency: 'USD',
        needEmail: true,
      },
    });
    const body = await res.json();
    expect(body.provider).toBe('telegram_payments');
    expect(body.payUrl).toMatch(/^https:\/\/t\.me\/\$/);

    const calls = await (await request.get(`${HARNESS}/__test/calls`)).json();
    const tgpCall = calls.calls.find((c: any) => c.method === 'createInvoiceLink' && c.body?.currency === 'USD');
    expect(tgpCall).toBeTruthy();
    expect(typeof tgpCall.body.provider_token).toBe('string');
    expect(tgpCall.body.provider_token.length).toBeGreaterThan(0);
    expect(tgpCall.body.need_email).toBe(true);
  });

  test('journey 7: TG Payments USD subscription successful_payment fires subscription.created', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '7 — TG Payments subscription' });
    const update = makeSuccessfulPaymentUpdate({
      userId: 6001,
      amount: 999,
      currency: 'USD',
      payload: 'sub:tgp:6001',
      chargeId: 'charge_tgp_sub_6001',
      isRecurring: true,
      isFirstRecurring: true,
    });
    await request.post(`${HARNESS}/webhook`, { headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, data: update });

    const events = await (await request.get(`${HARNESS}/__test/events`)).json();
    expect(events.events.find((e: any) => e.event === 'subscription.created')).toBeTruthy();
  });

  test('journey 6b: createProviderInvoice with stars dispatches StarsProvider', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '6b — Stars via createProviderInvoice' });
    const res = await request.post(`${HARNESS}/api/createProviderInvoice`, {
      data: { provider: 'stars', title: 'Premium', description: 'Monthly', payload: 'stars:6b', amount: 100, currency: 'XTR', subscription: true },
    });
    const body = await res.json();
    expect(body.provider).toBe('stars');
    expect(body.payUrl).toMatch(/^https:\/\/t\.me\/\$/);
  });
});
