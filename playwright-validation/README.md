# `@starspay/sdk` v0.2.0 Validation Plan

End-to-end Playwright validation for the **published SDK** (`@starspay/sdk`), exercised against:

- A locally-instantiated `createStarsPay()` with a mocked Telegram Bot API + a mocked StarsPay backend (no credentials required).
- Optionally, a real Telegram test-DC account + bot for the live buyer journeys (when credentials are provided).

This harness is **separate from** `tests/e2e/`, which validates the deployed canary backend. This one validates the **SDK package itself** — the import surface, the wire formats it produces, the React component contracts, and the state-machine behavior of the middleware.

---

## v0.2.0 surface under test

| Entry point | What's exercised |
|-------------|------------------|
| `@starspay/sdk` (shared) | Type re-exports, `STARS_CURRENCY`, `SUBSCRIPTION_PERIOD_SECONDS`, product-link helpers |
| `@starspay/sdk/server` | `createStarsPay()`, `middleware()`, `handleUpdate()`, `createInvoice()`, `createProviderInvoice()`, `refundPayment()`, `cancelSubscription()`, `refund()`, `isActive()`, `validateInitData()`, `parseWebhookUpdate()`, `StarsProvider`, `TelegramPaymentsProvider` |
| `@starspay/sdk/client` | `StarsPayClient` constructor + key enforcement, `isActive()`, `getActiveSubscription()`, `createInvoiceLink()`, `openPayment()` (WebApp mock), `openExternalPayment()` |
| `@starspay/sdk/react` | `<StarsPayProvider>`, `<PaywallGate>`, `<SubscriptionButton>`, `<PurchaseButton>`, `<ProductCheckout>`, `<PaymentMethodSelector>`, `useSubscription()`, `useProductLink()` |

---

## Customer journeys covered

Each journey is a row in the matrix. **Mock mode** runs without credentials; **Live mode** requires the env vars listed.

| # | Journey | Provider | Mock mode | Live mode (needs) |
|---|---------|----------|-----------|-------------------|
| 1 | One-time purchase: invoice creation → user pays → server records → `onEvent('payment.one_time')` fires | Stars | ✅ | `TEST_BOT_TOKEN`, `TELEGRAM_*` MTProto |
| 2 | Subscription create: invoice (subscription_period=2592000) → first payment → `subscription.created` event | Stars | ✅ | same |
| 3 | Subscription renewal: synthetic recurring `successful_payment` (`is_recurring=true, is_first_recurring=false`) → `subscription.renewed` event | Stars | ✅ | same |
| 4 | Cancel subscription: `cancelSubscription(userId, chargeId)` → Telegram `editUserStarSubscription` called with `is_canceled=true` | Stars | ✅ | live token to assert real Telegram response |
| 5 | Refund: `refund(userId, chargeId)` → Telegram `refundStarPayment` called → `payment.refunded` event when synthetic refund webhook arrives | Stars | ✅ | same |
| 6 | One-time purchase via Telegram Payments: `createProviderInvoice({ provider: 'telegram_payments' })` → invoice URL returned → user pays via card → `payment.one_time` | Telegram Payments | ✅ | `TELEGRAM_PAYMENTS_TEST_TOKEN`, `TEST_BOT_TOKEN`, MTProto |
| 7 | Subscription via Telegram Payments: same flow but with `subscription_period` and `is_recurring` flags on the resulting webhook | Telegram Payments | ✅ | same |
| 8 | Pre-checkout reject: `onPreCheckout` returns `false` → middleware calls `answerPreCheckoutQuery(approved=false, error=...)` | Both | ✅ | – |
| 9 | Pre-checkout backend reject: `reportPreCheckout` returns `{ allowed: false, reason: 'tx_limit' }` → middleware rejects | Both | ✅ | – |
| 10 | Webhook secret mismatch: middleware returns 403 when `X-Telegram-Bot-Api-Secret-Token` doesn't match | – | ✅ | – |
| 11 | initData validation: valid hash from real bot token passes; tampered fails; expired (`auth_date` > 24h ago) fails | – | ✅ | – |
| 12 | Currency guard: non-XTR `successful_payment` is rejected when `payments.providers` is unset; accepted when set | Both | ✅ | – |
| 13 | Browser client: instantiating `StarsPayClient` with `sp_live_*` throws; `sp_pub_*` succeeds; `isActive()` returns cached value within `cacheTtl` | – | ✅ | – |
| 14 | `<PaywallGate>`: when `isActive=true` renders children; when `false` renders `fallback`; when API errors renders `errorFallback` (or `fallback`) | – | ✅ | – |
| 15 | `<SubscriptionButton>` click → `createInvoiceLink` → `openPayment` → on `'paid'` callback fires `onSuccess` | Stars | ✅ | live for end-to-end paid status |
| 16 | `<PaymentMethodSelector>`: only `stars` + `telegram_payments` render; selection updates parent state | Both | ✅ | – |
| 17 | Product deep link: `generateProductLink({ priceId, botUsername })` → URL parses back via `parseProductLink()` | – | ✅ | – |
| 18 | `handleBotStart`: receives a product-link payload → fetches price/product → sends invoice / subscription button | Stars | ✅ | live for assert in real chat |

---

## Run modes

### Mock mode (no credentials)

```bash
cd packages/sdk/playwright-validation
npm install
npx playwright install chromium
npm test
```

The harness:
- Spins up an Express server on `127.0.0.1:0` that:
  - Mounts `createStarsPay({ apiKey, botToken: 'mock', webhookSecret: 'test-secret', testMode: true })`
  - Intercepts `fetch` to `https://api.telegram.org` and returns canned Bot API responses
  - Intercepts `fetch` to `api.starspay.dev` and returns canned StarsPay backend responses
- Spins up a Vite dev server hosting a tiny React app that imports `@starspay/sdk/react` + `@starspay/sdk/client`, with a fake `Telegram.WebApp` shim that resolves `openInvoice` to `'paid'`.

All journeys 1–18 run in mock mode (some assertions are necessarily about *what the SDK calls*, not what Telegram does in response).

### Live mode (Telegram test-DC credentials)

```bash
cd packages/sdk/playwright-validation
cp .env.example .env.live
# fill in TEST_BOT_TOKEN, TEST_BOT_USERNAME, TELEGRAM_API_ID, TELEGRAM_API_HASH,
# TELEGRAM_PHONE, TELEGRAM_SESSION_STRING, TELEGRAM_PAYMENTS_TEST_TOKEN
STARSPAY_LIVE=1 npm test
```

In live mode the harness still uses the mock StarsPay backend (we're testing the SDK, not the deployed backend), but routes Telegram Bot API calls to `api.telegram.org` (test DC when `TELEGRAM_USE_TEST_DC=1`) and uses GramJS to drive the buyer side of the conversation.

---

## File layout

```
playwright-validation/
├── README.md                    ← this doc
├── package.json
├── playwright.config.ts
├── .env.example
├── harness/
│   ├── server.ts                ← Express server with createStarsPay
│   ├── telegram-mock.ts         ← Telegram Bot API mock (fetch interceptor)
│   ├── starspay-backend-mock.ts ← StarsPay HTTP backend mock
│   └── app/                     ← Vite React app
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx              ← exposes each component for /paywall, /selector, /button routes
│       └── vite.config.ts
├── lib/
│   ├── webhook-payloads.ts      ← signed Telegram webhook payload synthesis
│   ├── webapp-shim.ts           ← fake Telegram.WebApp for browser specs
│   └── env.ts
└── specs/
    ├── server-middleware.spec.ts          ← journeys 1-3, 8-12 (server-side)
    ├── server-cancel-refund.spec.ts       ← journeys 4-5
    ├── server-telegram-payments.spec.ts   ← journeys 6-7
    ├── server-init-data.spec.ts           ← journey 11
    ├── server-handle-bot-start.spec.ts    ← journey 18
    ├── client-stars-pay-client.spec.ts    ← journey 13
    ├── react-paywall-gate.spec.ts         ← journey 14
    ├── react-subscription-button.spec.ts  ← journey 15
    ├── react-payment-selector.spec.ts     ← journey 16
    └── shared-product-links.spec.ts       ← journey 17
```

---

## Reporting

`playwright-report/` HTML output. Run `npx playwright show-report` after the suite to open it.

Each spec annotates the journey number it covers in `test.info().annotations` so the `playwright-report` filter UI can pick a single journey.

---

## Promotion gate before publishing

Before `npm publish @starspay/sdk@0.2.0`:

1. `npm run lint` (tsc --noEmit) — ✅ green
2. `npm test` (vitest, 342 unit tests) — ✅ green
3. `npm run build` (tsup, 4 entries) — ✅ green
4. `npm test` from `playwright-validation/` in mock mode — must be green
5. `STARSPAY_LIVE=1 npm test` in live mode (when creds provided) — must be green for the journeys flagged "live mode"
