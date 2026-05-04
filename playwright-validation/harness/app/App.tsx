import { useMemo, useState } from 'react';
import { StarsPayProvider, PaywallGate, SubscriptionButton, PurchaseButton, PaymentMethodSelector } from '@starspay/sdk/react';
import { StarsPayClient } from '@starspay/sdk/client';
import type { PaymentProvider } from '@starspay/sdk';

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        openInvoice: (url: string, cb: (status: string) => void) => void;
        openTelegramLink: (url: string) => void;
        openLink: (url: string) => void;
      };
    };
  }
}

// Fake Telegram WebApp shim — Playwright sets the resolved status via
// window.__nextOpenInvoiceResult before triggering payment.
if (typeof window !== 'undefined' && !window.Telegram) {
  window.Telegram = {
    WebApp: {
      openInvoice: (_url, cb) => {
        const result = (window as any).__nextOpenInvoiceResult || 'paid';
        setTimeout(() => cb(result), 10);
      },
      openTelegramLink: (url) => { (window as any).__lastTgLink = url; },
      openLink: (url) => { (window as any).__lastExternalLink = url; },
    },
  };
}

// Install fetch shim synchronously at module load — before any component
// calls window.fetch. The StarsPayProvider's first isActive() call would
// otherwise hit the network for an unresolvable host.
if (typeof window !== 'undefined' && !(window as any).__fetchShimmed) {
  const original = window.fetch;
  window.fetch = async (input: any, init: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/v1/subscriptions/active/')) {
      const flag = (window as any).__paywallActive;
      const subscription = (window as any).__paywallSubscription;
      return new Response(JSON.stringify({ active: !!flag, subscription }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/v1/invoices/create')) {
      return new Response(JSON.stringify({ url: `https://t.me/$mock_invoice_${Date.now()}` }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return original.call(window, input, init);
  };
  (window as any).__fetchShimmed = true;
}

const SP_PUB_KEY = 'sp_pub_test_harness';

export function App() {
  const route = typeof window !== 'undefined' ? window.location.pathname : '/';
  const userId = 7777777;

  const apiUrl = useMemo(() => 'https://localhost.starspay-mock', []);

  if (route === '/paywall') return <PaywallRoute apiUrl={apiUrl} userId={userId} />;
  if (route === '/subscription-button') return <SubscriptionRoute apiUrl={apiUrl} userId={userId} />;
  if (route === '/purchase-button') return <PurchaseRoute apiUrl={apiUrl} userId={userId} />;
  if (route === '/payment-method-selector') return <SelectorRoute />;
  if (route === '/client-direct') return <ClientDirectRoute apiUrl={apiUrl} userId={userId} />;
  return <Index />;
}

function Index() {
  return (
    <ul>
      <li><a href="/paywall">/paywall</a></li>
      <li><a href="/subscription-button">/subscription-button</a></li>
      <li><a href="/purchase-button">/purchase-button</a></li>
      <li><a href="/payment-method-selector">/payment-method-selector</a></li>
      <li><a href="/client-direct">/client-direct</a></li>
    </ul>
  );
}

function PaywallRoute({ apiUrl, userId }: { apiUrl: string; userId: number }) {
  return (
    <StarsPayProvider apiKey={SP_PUB_KEY} apiUrl={apiUrl} telegramUserId={userId}>
      <PaywallGate
        loading={<div data-testid="paywall-loading">Loading…</div>}
        fallback={<div data-testid="paywall-fallback">Subscribe to continue</div>}
        errorFallback={<div data-testid="paywall-error">Couldn't verify</div>}
      >
        <div data-testid="paywall-children">Premium content</div>
      </PaywallGate>
    </StarsPayProvider>
  );
}

function SubscriptionRoute({ apiUrl, userId }: { apiUrl: string; userId: number }) {
  const [outcome, setOutcome] = useState<string>('idle');
  return (
    <StarsPayProvider apiKey={SP_PUB_KEY} apiUrl={apiUrl} telegramUserId={userId}>
      <SubscriptionButton
        priceId="price_premium_monthly"
        onSuccess={() => setOutcome('success')}
        onError={(err) => setOutcome(`error:${err.message}`)}
      >
        Subscribe — 100 Stars/month
      </SubscriptionButton>
      <p data-testid="outcome">{outcome}</p>
    </StarsPayProvider>
  );
}

function PurchaseRoute({ apiUrl, userId }: { apiUrl: string; userId: number }) {
  const [outcome, setOutcome] = useState<string>('idle');
  return (
    <StarsPayProvider apiKey={SP_PUB_KEY} apiUrl={apiUrl} telegramUserId={userId}>
      <PurchaseButton
        priceId="price_one_time"
        onSuccess={() => setOutcome('success')}
        onError={(err) => setOutcome(`error:${err.message}`)}
      >
        Buy — 50 Stars
      </PurchaseButton>
      <p data-testid="outcome">{outcome}</p>
    </StarsPayProvider>
  );
}

function SelectorRoute() {
  const [provider, setProvider] = useState<PaymentProvider>('stars');
  return (
    <PaymentMethodSelector
      availableProviders={['stars', 'telegram_payments']}
      value={provider}
      onChange={setProvider}
    />
  );
}

function ClientDirectRoute({ apiUrl, userId }: { apiUrl: string; userId: number }) {
  const [active, setActive] = useState<string>('?');
  const [error, setError] = useState<string>('');
  return (
    <div>
      <button
        data-testid="run-active-check"
        onClick={async () => {
          try {
            const c = new StarsPayClient({ apiKey: SP_PUB_KEY, apiUrl });
            const a = await c.isActive(userId);
            setActive(String(a));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Run isActive
      </button>
      <button
        data-testid="run-bad-key"
        onClick={() => {
          try {
            new StarsPayClient({ apiKey: 'sp_live_oops', apiUrl });
            setError('NO_THROW');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Run bad-key constructor
      </button>
      <p data-testid="active">{active}</p>
      <p data-testid="error">{error}</p>
    </div>
  );
}
