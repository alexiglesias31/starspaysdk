/**
 * StarsPay HTTP backend mock — intercepts fetch to api.starspay.dev and to
 * the harness-configured STARSPAY_API_URL. The SDK uses this for
 * reportPreCheckout / reportPayment / reportRefund / isActive / getPrice.
 *
 * The mock keeps a tiny in-memory store of subscriptions + payments so specs
 * can drive an end-to-end flow (reportPayment → isActive returns true).
 */
import type { RequestInit } from 'undici';

interface ReportedPayment {
  telegram_user_id: number;
  payment_type: 'one_time' | 'subscription_initial' | 'subscription_renewal';
  amount: number;
  currency: string;
  telegram_payment_charge_id: string;
  invoice_payload: string;
}

const reportedPayments: ReportedPayment[] = [];
const activeUsers = new Set<number>();
let preCheckoutAllow: boolean | { allowed: false; reason: string } = true;

export function setPreCheckoutResult(value: boolean | { allowed: false; reason: string }): void {
  preCheckoutAllow = value;
}

export function reportedPaymentsLog(): readonly ReportedPayment[] {
  return reportedPayments;
}

export function resetBackendMock(): void {
  reportedPayments.length = 0;
  activeUsers.clear();
  preCheckoutAllow = true;
}

const realFetch = globalThis.fetch.bind(globalThis);

export function installBackendMock(apiUrl: string): void {
  const base = apiUrl.replace(/\/$/, '');

  const wrapped = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!url.startsWith(base)) {
      return wrapped(input as any, init as any);
    }

    const path = url.slice(base.length);
    const body: any = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;

    if (path === '/v1/webhooks/pre-checkout' && init?.method === 'POST') {
      const result = preCheckoutAllow === true ? { ok: true, allowed: true } : { ok: true, ...preCheckoutAllow };
      return jsonResponse(result);
    }

    if (path === '/v1/payments/report' && init?.method === 'POST') {
      reportedPayments.push(body);
      activeUsers.add(body.telegram_user_id);
      return jsonResponse({
        payment: { id: `pay_${reportedPayments.length}` },
        subscription: body.payment_type !== 'one_time' ? {
          id: `sub_${body.telegram_user_id}`,
          status: 'active',
          telegram_user_id: body.telegram_user_id,
        } : null,
      });
    }

    if (path === '/v1/payments/refund' && init?.method === 'POST') {
      activeUsers.delete(body.telegram_user_id);
      return jsonResponse({ refund: { id: `ref_${Date.now()}` } });
    }

    const activeMatch = path.match(/^\/v1\/subscriptions\/active\/(\d+)$/);
    if (activeMatch) {
      const uid = Number(activeMatch[1]);
      return jsonResponse({ active: activeUsers.has(uid) });
    }

    const priceMatch = path.match(/^\/v1\/prices\/([^/?]+)/);
    if (priceMatch) {
      return jsonResponse({
        price: { id: priceMatch[1], app_id: 'app_test', amount: 100, currency: 'XTR', period: 2592000, active: true },
        product: { id: 'prod_test', app_id: 'app_test', name: 'Premium', description: 'Test product', type: 'subscription', active: true },
      });
    }

    return new Response(JSON.stringify({ error: 'mock_unhandled', path }), { status: 404, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
