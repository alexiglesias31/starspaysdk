/**
 * Harness HTTP server. Wraps `createStarsPay()` from the SDK and exposes
 * a thin REST surface that Playwright specs hit:
 *
 *   POST /webhook                 — Telegram webhook in (delegates to middleware)
 *   POST /api/createInvoice       — exercises createInvoice()
 *   POST /api/createProviderInvoice
 *   POST /api/cancelSubscription
 *   POST /api/refund
 *   POST /api/refundPayment
 *   POST /api/handleBotStart
 *   GET  /api/isActive/:userId
 *   POST /__test/setPreCheckout   — sets the backend pre-checkout mock result
 *   POST /__test/reset            — resets all in-memory state
 *   GET  /__test/calls            — recorded Telegram Bot API calls
 *   GET  /__test/payments         — reported payments
 *   POST /__test/onEvents         — records onEvent firings
 *   GET  /__test/events           — replay of onEvent firings
 */

import express from 'express';
import { createStarsPay } from '@starspay/sdk/server';
import {
  installTelegramMock,
  recordedCalls as recordedTgCalls,
  resetMock as resetTgMock,
  stubBotMethod,
} from './telegram-mock.js';
import {
  installBackendMock,
  resetBackendMock,
  setPreCheckoutResult,
  reportedPaymentsLog,
} from './starspay-backend-mock.js';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const isLive = process.env.STARSPAY_LIVE === '1';
const HARNESS_API_URL = process.env.HARNESS_STARSPAY_API_URL || 'https://localhost.starspay-mock';
installTelegramMock();
installBackendMock(HARNESS_API_URL);

const observedEvents: { event: string; data: unknown }[] = [];

// In live mode, swap the harness bot token for the real test-DC token so
// Telegram accepts API calls. Also swap the Telegram Payments provider
// token for the merchant's real test PSP token.
const botToken = isLive && process.env.TEST_BOT_TOKEN
  ? process.env.TEST_BOT_TOKEN
  : '123456789:HARNESS_BOT_TOKEN_AAAAAAAAAAAAAAAAAAAA';

const tgPaymentsToken = isLive && process.env.TELEGRAM_PAYMENTS_TEST_TOKEN
  ? process.env.TELEGRAM_PAYMENTS_TEST_TOKEN
  : '123456789:TEST:harness';

const starspay = createStarsPay({
  apiKey: 'sp_test_harness_key',
  botToken,
  apiUrl: HARNESS_API_URL,
  webhookSecret: 'harness-secret',
  testMode: true,
  payments: {
    providers: {
      tg_payments_default: {
        token: tgPaymentsToken,
        testToken: tgPaymentsToken,
      },
    },
  },
  onPreCheckout: async () => true,
  onEvent: async (event, data) => {
    observedEvents.push({ event, data });
  },
});

const app = express();
app.use(express.json());

app.post('/webhook', starspay.middleware(), (_req, res) => {
  res.sendStatus(200);
});

app.post('/api/createInvoice', async (req, res) => {
  try {
    const url = await starspay.createInvoice(req.body);
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/createProviderInvoice', async (req, res) => {
  try {
    const result = await starspay.createProviderInvoice(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/cancelSubscription', async (req, res) => {
  try {
    const result = await starspay.cancelSubscription(req.body.userId, req.body.chargeId);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/refund', async (req, res) => {
  try {
    const result = await starspay.refund(req.body.userId, req.body.chargeId);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/refundPayment', async (req, res) => {
  try {
    const result = await starspay.refundPayment(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/handleBotStart', async (req, res) => {
  try {
    const handled = await starspay.handleBotStart(req.body.chatId, req.body.startParam);
    res.json({ handled });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/isActive/:userId', async (req, res) => {
  try {
    const active = await starspay.isActive(Number(req.params.userId));
    res.json({ active });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/__test/reset', (_req, res) => {
  observedEvents.length = 0;
  resetTgMock();
  resetBackendMock();
  res.json({ ok: true });
});

app.post('/__test/setPreCheckout', (req, res) => {
  setPreCheckoutResult(req.body.value);
  res.json({ ok: true });
});

app.post('/__test/stubTelegram', (req, res) => {
  stubBotMethod(req.body.method, req.body.result);
  res.json({ ok: true });
});

app.get('/__test/calls', (_req, res) => {
  res.json({ calls: recordedTgCalls() });
});

app.get('/__test/payments', (_req, res) => {
  res.json({ payments: reportedPaymentsLog() });
});

app.get('/__test/events', (_req, res) => {
  res.json({ events: observedEvents });
});

const port = Number(process.env.SDK_SERVER_PORT) || 4173;
app.listen(port, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`[sdk-validation] harness listening on http://127.0.0.1:${port}`);
});
