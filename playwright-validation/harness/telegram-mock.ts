/**
 * Telegram Bot API mock — intercepts global fetch calls to api.telegram.org
 * and returns canned responses. The recorded call log lets specs assert that
 * the SDK called Telegram with the expected arguments.
 *
 * Live mode (STARSPAY_LIVE=1) bypasses the mock and lets calls hit the real
 * api.telegram.org so we can drive the test datacenter end-to-end.
 */
import type { RequestInit } from 'undici';

interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

const calls: RecordedCall[] = [];
const stubResponses = new Map<string, unknown>();

export function recordedCalls(): readonly RecordedCall[] {
  return calls;
}

export function resetMock(): void {
  calls.length = 0;
  stubResponses.clear();
}

export function stubBotMethod(method: string, result: unknown): void {
  stubResponses.set(method, result);
}

const isLive = process.env.STARSPAY_LIVE === '1';
const realFetch = globalThis.fetch.bind(globalThis);

export function installTelegramMock(): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!url.startsWith('https://api.telegram.org')) {
      return realFetch(input as any, init as any);
    }

    const methodMatch = url.match(/\/bot[^/]+\/(\w+)/);
    const tgMethod = methodMatch ? methodMatch[1] : 'unknown';
    let body: unknown = null;
    if (init?.body && typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ method: tgMethod, url, body });

    if (isLive) {
      // Live mode: forward to real Telegram so buyer-side flows actually
      // mint real invoice URLs / hit real Bot API. Calls are still recorded
      // above so specs can assert on what the SDK sent.
      return realFetch(input as any, init as any);
    }

    const stubbed = stubResponses.get(tgMethod);
    const result = stubbed !== undefined ? stubbed : defaultStubFor(tgMethod);

    return new Response(
      JSON.stringify({ ok: true, result }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
}

function defaultStubFor(tgMethod: string): unknown {
  switch (tgMethod) {
    case 'createInvoiceLink':
      return `https://t.me/$mock_invoice_${Date.now()}`;
    case 'sendInvoice':
      return { message_id: 1 };
    case 'sendMessage':
      return { message_id: 2 };
    case 'answerPreCheckoutQuery':
    case 'answerShippingQuery':
    case 'refundStarPayment':
    case 'editUserStarSubscription':
      return true;
    default:
      return true;
  }
}
