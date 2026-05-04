/**
 * Server cancel + refund journeys (4, 5).
 */
import { test, expect } from '@playwright/test';
import { makeRefundedPaymentUpdate } from '../lib/webhook-payloads.ts';

const HARNESS = 'http://127.0.0.1:4173';
const WEBHOOK_SECRET = 'harness-secret';

test.describe('Server cancel + refund', () => {
  test.beforeEach(async ({ request }) => { await request.post(`${HARNESS}/__test/reset`); });

  test('journey 4: cancelSubscription calls Telegram editUserStarSubscription with is_canceled=true', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '4 — cancel subscription' });
    await request.post(`${HARNESS}/api/cancelSubscription`, { data: { userId: 2001, chargeId: 'charge_2001' } });
    const calls = await (await request.get(`${HARNESS}/__test/calls`)).json();
    const cancel = calls.calls.find((c: any) => c.method === 'editUserStarSubscription');
    expect(cancel).toBeTruthy();
    expect(cancel.body).toMatchObject({ user_id: 2001, telegram_payment_charge_id: 'charge_2001', is_canceled: true });
  });

  test('journey 5a: refund() calls Telegram refundStarPayment', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '5a — refund Stars payment' });
    await request.post(`${HARNESS}/api/refund`, { data: { userId: 2002, chargeId: 'charge_2002' } });
    const calls = await (await request.get(`${HARNESS}/__test/calls`)).json();
    const refund = calls.calls.find((c: any) => c.method === 'refundStarPayment');
    expect(refund).toBeTruthy();
    expect(refund.body).toMatchObject({ user_id: 2002, telegram_payment_charge_id: 'charge_2002' });
  });

  test('journey 5b: refunded webhook fires payment.refunded onEvent', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '5b — refund webhook event' });
    const update = makeRefundedPaymentUpdate({ userId: 2003, amount: 100, payload: 'sub:premium:2003', chargeId: 'charge_2003' });
    await request.post(`${HARNESS}/webhook`, { headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, data: update });

    const events = await (await request.get(`${HARNESS}/__test/events`)).json();
    expect(events.events.find((e: any) => e.event === 'payment.refunded')).toBeTruthy();
  });

  test('journey 5c: refundPayment via Stars provider returns success + provider name', async ({ request }) => {
    test.info().annotations.push({ type: 'journey', description: '5c — refundPayment (Stars)' });
    test.skip(process.env.STARSPAY_LIVE === '1', 'Live mode: Telegram rejects refund of synthetic charge_id; spec asserts mock-mode contract');
    const res = await request.post(`${HARNESS}/api/refundPayment`, { data: { provider: 'stars', chargeId: 'charge_2004', telegramUserId: 2004 } });
    const body = await res.json();
    expect(body).toMatchObject({ success: true, provider: 'stars', refundId: 'charge_2004' });
  });
});
