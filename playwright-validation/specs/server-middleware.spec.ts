/**
 * Server middleware journeys (1-3, 8-10, 12).
 *
 * Drives the harness HTTP server. Asserts that the SDK middleware
 * processes synthesized Telegram webhook payloads correctly:
 *   - records payments to the (mocked) StarsPay backend
 *   - fires onEvent callbacks
 *   - calls answerPreCheckoutQuery with the right approval state
 *   - rejects requests with bad webhook secrets
 */
import { test, expect, request } from '@playwright/test';
import {
  makePreCheckoutQueryUpdate,
  makeSuccessfulPaymentUpdate,
} from '../lib/webhook-payloads.ts';

const HARNESS = 'http://127.0.0.1:4173';
const WEBHOOK_SECRET = 'harness-secret';

async function reset(api: import('@playwright/test').APIRequestContext) {
  await api.post(`${HARNESS}/__test/reset`);
}

test.describe('Server middleware', () => {
  test.beforeEach(async ({ request }) => { await reset(request); });

  test('journey 1: Stars one-time purchase records payment + fires payment.one_time', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '1 — Stars one-time purchase' });
    const update = makeSuccessfulPaymentUpdate({
      userId: 1001,
      amount: 100,
      currency: 'XTR',
      payload: 'one_time:test:1001',
      chargeId: 'charge_one_1001',
    });

    const res = await request.post(`${HARNESS}/webhook`, {
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET, 'content-type': 'application/json' },
      data: update,
    });
    expect(res.status()).toBe(200);

    const payments = await (await request.get(`${HARNESS}/__test/payments`)).json();
    expect(payments.payments).toHaveLength(1);
    expect(payments.payments[0]).toMatchObject({
      telegram_user_id: 1001, payment_type: 'one_time', amount: 100, currency: 'XTR',
    });

    const events = await (await request.get(`${HARNESS}/__test/events`)).json();
    expect(events.events.find((e: any) => e.event === 'payment.one_time')).toBeTruthy();
  });

  test('journey 2: Stars subscription_initial fires subscription.created', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '2 — Stars subscription create' });
    const update = makeSuccessfulPaymentUpdate({
      userId: 1002,
      amount: 100,
      currency: 'XTR',
      payload: 'sub:premium:1002',
      chargeId: 'charge_sub_init_1002',
      isRecurring: true,
      isFirstRecurring: true,
      subscriptionExpirationDate: Math.floor(Date.now() / 1000) + 2_592_000,
    });
    await request.post(`${HARNESS}/webhook`, { headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, data: update });

    const events = await (await request.get(`${HARNESS}/__test/events`)).json();
    expect(events.events.find((e: any) => e.event === 'subscription.created')).toBeTruthy();
  });

  test('journey 3: Stars subscription_renewal fires subscription.renewed', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '3 — Stars subscription renewal' });
    const update = makeSuccessfulPaymentUpdate({
      userId: 1003,
      amount: 100,
      currency: 'XTR',
      payload: 'sub:premium:1003',
      chargeId: 'charge_sub_renew_1003',
      isRecurring: true,
      isFirstRecurring: false,
    });
    await request.post(`${HARNESS}/webhook`, { headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, data: update });

    const events = await (await request.get(`${HARNESS}/__test/events`)).json();
    expect(events.events.find((e: any) => e.event === 'subscription.renewed')).toBeTruthy();
  });

  test('journey 8/9: pre-checkout reject with backend tx_limit', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '9 — backend pre-checkout reject' });
    await request.post(`${HARNESS}/__test/setPreCheckout`, { data: { value: { allowed: false, reason: 'tx_limit_exceeded' } } });
    const update = makePreCheckoutQueryUpdate({
      userId: 1009, amount: 999, currency: 'USD', payload: 'pc:1009',
    });
    await request.post(`${HARNESS}/webhook`, { headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, data: update });

    const calls = await (await request.get(`${HARNESS}/__test/calls`)).json();
    const answer = calls.calls.find((c: any) => c.method === 'answerPreCheckoutQuery');
    expect(answer).toBeTruthy();
    expect(answer.body).toMatchObject({ ok: false, error_message: 'tx_limit_exceeded' });
  });

  test('journey 10: webhook secret mismatch returns 403', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '10 — webhook secret mismatch 403' });
    const update = makeSuccessfulPaymentUpdate({
      userId: 1010, amount: 100, currency: 'XTR', payload: 'sec:1010', chargeId: 'charge_sec_1010',
    });
    const res = await request.post(`${HARNESS}/webhook`, {
      headers: { 'x-telegram-bot-api-secret-token': 'WRONG', 'content-type': 'application/json' },
      data: update,
    });
    expect(res.status()).toBe(403);
  });

  test('journey 12: non-XTR payment is processed when providers configured', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '12 — currency guard (providers configured)' });
    const update = makeSuccessfulPaymentUpdate({
      userId: 1012, amount: 999, currency: 'USD', payload: 'tgp:1012', chargeId: 'charge_usd_1012',
    });
    await request.post(`${HARNESS}/webhook`, { headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, data: update });

    const payments = await (await request.get(`${HARNESS}/__test/payments`)).json();
    expect(payments.payments.find((p: any) => p.telegram_payment_charge_id === 'charge_usd_1012')).toBeTruthy();
  });
});
