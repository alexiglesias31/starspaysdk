# @starspay/sdk

[![npm version](https://img.shields.io/npm/v/@starspay/sdk.svg)](https://www.npmjs.com/package/@starspay/sdk)
[![license](https://img.shields.io/npm/l/@starspay/sdk.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@starspay/sdk.svg)](./dist/index.d.ts)

**Telegram payments for Mini Apps and bots — Telegram Stars and Telegram Payments (cards) — with subscriptions, paywalls, and webhooks in a few lines of code.**

`@starspay/sdk` is the official client + server SDK for [StarsPay](https://starspay.dev) — a managed backend that abstracts Telegram payment providers behind one typed, framework-friendly subscription platform. Think of it as RevenueCat for Telegram Mini Apps.

- **Telegram payment providers** — Telegram Stars (XTR) and Telegram Payments API (Stripe-via-TG, fiat cards via the gateway you configure in `@BotFather`). Pick per product/price.
- **Subscription state machine** — six states (`pending`, `active`, `canceled`, `past_due`, `expired`, `revoked`) with enforced transitions and a 3-day grace period. Fiat-renewal scheduler available for non-Stars subscriptions.
- **Auto-handled `pre_checkout_query`** — middleware answers Telegram inside the 10-second deadline so you never miss a payment
- **Browser-safe client** — `sp_pub_*` publishable-key enforcement; server keys throw on construction
- **React components** — `<PaywallGate>`, `<SubscriptionButton>`, `<PurchaseButton>`, `<ProductCheckout>`, `<PaymentMethodSelector>`, `useSubscription()`
- **Product deep links** — generate `t.me/yourbot?start=buy_<priceId>` URLs that open straight into checkout
- **Init-data validation** — constant-time HMAC verification for Mini App `initData`
- **Refund + cancel** — wraps `editUserStarSubscription` and `refundStarPayment` (Stars); Telegram Payments refunds are handled by the upstream PSP
- **Test mode** — bypass entitlement checks in development without touching production data
- **Zero runtime deps** for shared/server code; React is an optional peer

> Get an API key at [app.starspay.dev](https://app.starspay.dev). Full guides at [docs.starspay.dev](https://docs.starspay.dev).

---

## Install

```bash
npm install @starspay/sdk
```

Requires **Node.js 18+** for the server entry. React **>=18** is an optional peer dependency for the React entry.

## Entry points

The package ships four entry points; import only what you need.

| Import                          | Use it in                          | Ships                                           |
| ------------------------------- | ---------------------------------- | ----------------------------------------------- |
| `@starspay/sdk`                 | Anywhere (shared)                  | Types, constants, product-link helpers          |
| `@starspay/sdk/server`          | Node.js bots / webhook handlers    | `createStarsPay`, `validateInitData`, API clients, `StarsProvider` + `TelegramPaymentsProvider` |
| `@starspay/sdk/client`          | Browsers / Mini Apps (vanilla JS)  | `StarsPayClient`, `isEntitled`                  |
| `@starspay/sdk/react`           | React Mini Apps                    | Provider, hooks, gate + button components       |

Both ESM and CommonJS builds are emitted with full `.d.ts` types.

---

## Server quickstart

### Express

```ts
import express from 'express';
import { createStarsPay } from '@starspay/sdk/server';

const starspay = createStarsPay({
  apiKey: process.env.STARSPAY_API_KEY!,        // sp_live_... or sp_test_...
  botToken: process.env.BOT_TOKEN!,
  webhookSecret: process.env.WEBHOOK_SECRET!,    // required in production
  onEvent: async (event, data) => {
    // event: 'payment.one_time' | 'subscription.created' | 'subscription.renewed' | 'payment.refunded'
    console.log(event, data.telegramUserId, data.amount);
  },
});

const app = express();

app.post(
  '/webhook',
  express.json(),
  starspay.middleware(),  // intercepts pre_checkout + successful_payment + refund
  (req, res) => {
    // your bot logic for non-payment updates
    res.sendStatus(200);
  },
);
```

The middleware returns `200` after a successful payment is recorded and `403` when the `X-Telegram-Bot-Api-Secret-Token` header doesn't match. Configure that header by passing `secret_token` to Telegram's `setWebhook` call.

### Cloudflare Workers / Fastify / anywhere else

If you don't have an Express-style middleware chain, drive the SDK directly:

```ts
const starspay = createStarsPay({ apiKey, botToken, webhookSecret });

export default {
  async fetch(req: Request) {
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token') ?? undefined;
    const update = await req.json();
    await starspay.handleUpdate(update, secretHeader); // throws on invalid secret
    return new Response('OK');
  },
};
```

### Create a subscription invoice

```ts
const invoiceUrl = await starspay.createInvoice({
  title: 'Premium',                            // ≤32 bytes UTF-8
  description: 'Unlock all features',          // ≤255 bytes UTF-8
  payload: `sub:premium:${userId}:${Date.now()}`,
  amount: 100,                                 // Stars (1–10,000)
  subscription: true,                          // 30-day recurring
});

await bot.sendMessage(chatId, `Subscribe: ${invoiceUrl}`);
```

### Check entitlement, cancel, refund

```ts
const isActive = await starspay.isActive(telegramUserId);

await starspay.cancelSubscription(telegramUserId, telegramPaymentChargeId); // disable auto-renew
await starspay.refund(telegramUserId, telegramPaymentChargeId);             // full refund
```

### Validate Mini App `initData`

```ts
import { validateInitData } from '@starspay/sdk/server';

const data = validateInitData(req.body.initData, process.env.BOT_TOKEN!);
const userId = data.user?.id; // verified
```

### Handle product link `/start` payloads

```ts
// Inside your bot's /start handler
const handled = await starspay.handleBotStart(chatId, ctx.startPayload);
if (!handled) {
  // not a StarsPay link — fall back to your normal welcome flow
}
```

---

## Payment providers

StarsPay supports the following buyer-side providers. The provider is chosen per-price in your dashboard (`provider` column on the `prices` table); the SDK + backend dispatch automatically.

| Provider | Currency | Invoice mechanism | Refunds |
|----------|----------|-------------------|---------|
| `stars` | XTR (Telegram Stars) | `createInvoiceLink` (currency=XTR) | Yes — `refundStarPayment` |
| `telegram_payments` | EUR / USD / ... (fiat cards) | `createInvoiceLink` + `provider_token` from BotFather | No (handled by upstream PSP) |

### Configure providers on the server

When using `createStarsPay`, pass the keys your merchants saved in the dashboard. Only the providers you configure are dispatchable.

```ts
import { createStarsPay } from '@starspay/sdk/server';

const starspay = createStarsPay({
  apiKey: process.env.STARSPAY_API_KEY!,
  botToken: process.env.BOT_TOKEN!,
  webhookSecret: process.env.WEBHOOK_SECRET!,
  payments: {
    providers: {
      // The key is the merchant-defined identifier; token comes from @BotFather.
      // Optional `testToken` is used when testMode is enabled.
      stripe: { token: process.env.TG_PAYMENTS_TOKEN!, testToken: process.env.TG_PAYMENTS_TEST_TOKEN },
    },
  },
});
```

### Create a Telegram Payments invoice

```ts
const invoice = await starspay.createProviderInvoice({
  provider: 'telegram_payments',
  title: 'Premium',
  description: 'Premium plan',
  amount: 999,                     // smallest unit (cents)
  currency: 'USD',
  payload: `sub:premium:${userId}:${Date.now()}`,
  needEmail: true,                 // optional — collect email at checkout
});

console.log(invoice.payUrl);
console.log(invoice.providerInvoiceId);
```

### Provider classes

If you need lower-level control (custom invoice flows, refund logic), the provider classes are exported directly:

```ts
import {
  StarsProvider,
  TelegramPaymentsProvider,
  TelegramApiClient,
} from '@starspay/sdk/server';

const telegram = new TelegramApiClient(process.env.BOT_TOKEN!);
const stars = new StarsProvider(telegram);

const invoice = await stars.createInvoice({
  title: 'Premium',
  description: 'Monthly premium',
  payload: 'sub:premium:123',
  amount: 100,
  subscription: true,
});
```

---

## Browser quickstart

```ts
import { StarsPayClient } from '@starspay/sdk/client';

const client = new StarsPayClient({
  apiKey: import.meta.env.VITE_STARSPAY_PUB_KEY, // must start with sp_pub_
});

const isActive = await client.isActive(telegramUserId);

const url = await client.createInvoiceLink({
  priceId: 'price_monthly_premium',
  telegramUserId,
});

const status = await client.openPayment(url); // 'paid' | 'cancelled' | 'failed' | 'pending'
```

The client enforces publishable keys (`sp_pub_*`) and throws on `sp_live_*` / `sp_test_*` / `sk_*` to prevent accidentally shipping a server key to the browser. Subscription queries are memoized for 30 seconds (configurable via `cacheTtl`).

### Plan-limit error handling

```ts
import { TxLimitExceededError } from '@starspay/sdk';

try {
  await client.createInvoiceLink({ priceId, telegramUserId });
} catch (err) {
  if (err instanceof TxLimitExceededError) {
    // err.tier, err.txCount, err.txLimit — show an upgrade prompt
  }
}
```

---

## React quickstart

```tsx
import {
  StarsPayProvider,
  PaywallGate,
  SubscriptionButton,
} from '@starspay/sdk/react';

function App() {
  const userId = window.Telegram.WebApp.initDataUnsafe.user?.id;

  return (
    <StarsPayProvider apiKey={import.meta.env.VITE_STARSPAY_PUB_KEY} telegramUserId={userId}>
      <PaywallGate
        loading={<Spinner />}
        fallback={
          <SubscriptionButton
            priceId="price_monthly_premium"
            onSuccess={() => location.reload()}
          >
            Subscribe — 100 Stars/month
          </SubscriptionButton>
        }
        errorFallback={<p>Couldn't verify subscription. Try again.</p>}
      >
        <PremiumApp />
      </PaywallGate>
    </StarsPayProvider>
  );
}
```

`PaywallGate` is **fail-closed**: errors render `errorFallback` (or `fallback` when omitted), never `children`.

> **Security note:** `PaywallGate` is a UX convenience, not a security boundary. Always re-check entitlement server-side with `starspay.isActive()` or the middleware before serving premium data.

### Hooks

```tsx
import { useSubscription, useProductLink } from '@starspay/sdk/react';

function Status() {
  const { isActive, subscription, isLoading, error, refresh } = useSubscription();
  // ...
}
```

### Other components

- `<PurchaseButton priceId={...} />` — one-time purchases
- `<ProductCheckout priceId={...} />` — full checkout card with price + product details
- `<PaymentMethodSelector availableProviders={['stars', 'telegram_payments']} value={...} onChange={...} />` — selector grid for users who can pick a method

---

## Subscription state machine

```
pending ──► active ──┬─► canceled ──► expired ──► (terminal)
                     ├─► past_due ──► expired
                     └─► revoked  ──► (terminal)
```

States that grant access (`ENTITLED_STATUSES`): `active`, `canceled`, `past_due`. `canceled` users keep access until `current_period_end`; `past_due` users keep access during the grace window (default 3 days, configurable per app).

Transitions are validated via the `VALID_TRANSITIONS` map exported from `@starspay/sdk`. Invalid transitions throw and are never written to the backend.

---

## Product deep links

Generate shareable Telegram links that drop the user straight into checkout — no Mini App code required.

```ts
import { generateProductLink } from '@starspay/sdk';

const link = generateProductLink({
  botUsername: 'mybot',
  priceId: 'price_monthly_premium',
  type: 'bot_start',                  // or 'mini_app' with appShortName
});
// → https://t.me/mybot?start=buy_price_monthly_premium
```

Pair with `starspay.handleBotStart(chatId, startParam)` on the server to send the invoice automatically.

---

## API key types

| Prefix       | Where it goes              | Enforcement                                        |
| ------------ | -------------------------- | -------------------------------------------------- |
| `sp_live_*`  | Server (production)        | Required for live payments                         |
| `sp_test_*`  | Server (development)       | Use against the staging API URL                    |
| `sp_pub_*`   | Browser / Mini App         | Browser client throws if any other prefix is used  |

Get keys at [app.starspay.dev](https://app.starspay.dev) → Settings.

## Test mode

```ts
const starspay = createStarsPay({ apiKey, botToken, testMode: true });
await starspay.isActive(123);  // → true (no API call)
```

`testMode` requires `NODE_ENV` to be `development` or `test`, and refuses to run against `api.starspay.dev`. The browser client also accepts `testMode: true` and logs a warning when combined with a publishable key.

## Webhook secret (production)

`createStarsPay` **throws** if `webhookSecret` is missing outside of test mode. To use it:

1. Pass `webhookSecret: '...'` when constructing `createStarsPay`.
2. Pass the same value as `secret_token` to Telegram's `setWebhook`.

The middleware verifies the `X-Telegram-Bot-Api-Secret-Token` header in constant time and returns `403` on mismatch. When you call `handleUpdate` directly, pass the header value as the second argument.

---

## Constants

Exported from `@starspay/sdk`:

| Constant                          | Value      | Meaning                                  |
| --------------------------------- | ---------- | ---------------------------------------- |
| `STARS_CURRENCY`                  | `'XTR'`    | Telegram Stars currency code             |
| `SUBSCRIPTION_PERIOD_SECONDS`     | `2592000`  | 30 days — only period Telegram supports  |
| `DEFAULT_GRACE_PERIOD_SECONDS`    | `259200`   | 3 days                                   |
| `MIN_INVOICE_AMOUNT`              | `1`        | Minimum invoice in Stars                 |
| `MAX_SUBSCRIPTION_AMOUNT`         | `10000`    | Maximum subscription per period in Stars |
| `STARS_TO_USD_RATE`               | `0.013`    | Approximate conversion rate              |

---

## Links

- **Documentation:** [docs.starspay.dev](https://docs.starspay.dev)
- **Dashboard:** [app.starspay.dev](https://app.starspay.dev)
- **Issues:** [github.com/alexiglesias31/starspaysdk/issues](https://github.com/alexiglesias31/starspaysdk/issues)
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md)

## License

[MIT](./LICENSE) © Alejandro Iglesias
