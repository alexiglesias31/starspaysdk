# Changelog

All notable changes to `@starspay/sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-05-04

### Added

- **Telegram Payments provider** (`TelegramPaymentsProvider`) — first-class support for the Telegram Payments API (Stripe / YooKassa / Redsys / etc., gateway configured in `@BotFather`). Use via `createProviderInvoice({ provider: 'telegram_payments', ... })` or instantiate the class directly.
- **Provider abstraction** — `PaymentProvider` discriminator type plus `ProviderInvoiceResult`, `ProviderPaymentEvent`, `ProviderRefundResult` for normalized provider results across implementations.
- **`createProviderInvoice()` + `refundPayment()`** on `createStarsPay()` for multi-provider invoice creation and refunds.
- **`StarsProvider`** — Stars payment logic factored out of the middleware into a reusable provider class, exported from `@starspay/sdk/server`.
- **`<PaymentMethodSelector />`** — React component for letting users pick between configured payment providers.
- **Currency guard** — payments in non-XTR currencies are accepted only when `payments.providers` is configured.

### Changed

- `ProviderConfig.providers` is now the canonical home for Telegram Payments tokens (`{ token, testToken? }` pairs keyed by merchant-chosen identifier).
- `package.json` description updated to reflect Telegram Stars + Telegram Payments scope.

## [0.1.0] - 2026-04-19

Initial public release.

### Added

- **Server entry (`@starspay/sdk/server`)**
  - `createStarsPay()` — server factory with Express/Connect-compatible `middleware()`, `handleUpdate()`, `createInvoice()`, `isActive()`, `cancelSubscription()`, `refund()`, and `handleBotStart()`
  - `validateInitData()` — Telegram Mini App HMAC-SHA256 init-data verification
  - `verifyWebhookSecret()` — constant-time webhook secret comparison
  - `TelegramApiClient` — Telegram Bot API wrapper for Stars payment endpoints
  - `StarsPayApiClient` — HTTP client for the StarsPay backend
  - `parseWebhookUpdate()` / `isPaymentUpdate()` — Telegram update classifiers
  - `SubscriptionManager` — pluggable subscription state machine
- **Browser entry (`@starspay/sdk/client`)**
  - `StarsPayClient` — browser client with caching, publishable-key enforcement, and `Telegram.WebApp.openInvoice()` integration
  - `isEntitled()` — entitlement helper
- **React entry (`@starspay/sdk/react`)**
  - `StarsPayProvider`, `useStarsPay`
  - `PaywallGate`, `SubscriptionButton`, `PurchaseButton`, `ProductCheckout`
  - `useSubscription`, `useProductLink`
- **Shared (`@starspay/sdk`)**
  - Subscription state machine types and `VALID_TRANSITIONS` map
  - Telegram Stars constants (`STARS_CURRENCY`, `SUBSCRIPTION_PERIOD_SECONDS`, etc.)
  - `generateProductLink()` / `parseProductLink()` for shareable purchase deep links
  - `TxLimitExceededError` for plan limit handling

[0.2.2]: https://github.com/alexiglesias31/starspaysdk/releases/tag/v0.2.2
[0.1.0]: https://github.com/alexiglesias31/starspaysdk/releases/tag/v0.1.0
