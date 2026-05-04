/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StarsPayProvider } from '../../src/react/StarsPayProvider';
import { ProductCheckout } from '../../src/react/ProductCheckout';
import type { ReactNode } from 'react';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <StarsPayProvider apiKey="sp_pub_123" telegramUserId={12345}>
      {children}
    </StarsPayProvider>
  );
}

const mockOneTimeProduct = {
  price: { id: 'price_1', product_id: 'prod_1', amount: 50, currency: 'XTR', period: null },
  product: { id: 'prod_1', name: 'Digital Item', description: 'A cool digital item', type: 'one_time', active: true },
};

const mockSubscriptionProduct = {
  price: { id: 'price_2', product_id: 'prod_2', amount: 100, currency: 'XTR', period: 2592000 },
  product: { id: 'prod_2', name: 'Premium Plan', description: 'Monthly access', type: 'subscription', active: true },
};

describe('ProductCheckout', () => {
  it('should render notFound for non-product-link param (no underscore)', () => {
    render(
      <Wrapper>
        <ProductCheckout
          startParam="nounderscore"
          notFound={<div data-testid="not-found">Not a product</div>}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('not-found')).toBeDefined();
  });

  it('should render nothing when startParam is undefined', () => {
    const { container } = render(
      <Wrapper>
        <ProductCheckout />
      </Wrapper>
    );

    expect(container.textContent).toBe('');
  });

  it('should show loading state while fetching product', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {})); // Never resolves

    render(
      <Wrapper>
        <ProductCheckout
          startParam="buy_price_1"
          loading={<div data-testid="loading">Loading...</div>}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('loading')).toBeDefined();
  });

  it('should render PurchaseButton for one-time product', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockOneTimeProduct), { status: 200 })
    );

    render(
      <Wrapper>
        <ProductCheckout
          startParam="buy_price_1"
          loading={<div data-testid="loading">Loading...</div>}
        />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Digital Item')).toBeDefined();
    });

    expect(screen.getByText('A cool digital item')).toBeDefined();
    expect(screen.getByRole('button', { name: /Buy for 50 Stars/i })).toBeDefined();
  });

  it('should render SubscriptionButton for subscription product', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSubscriptionProduct), { status: 200 })
    );

    render(
      <Wrapper>
        <ProductCheckout
          startParam="buy_price_2"
          loading={<div data-testid="loading">Loading...</div>}
        />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Premium Plan')).toBeDefined();
    });

    expect(screen.getByText('Monthly access')).toBeDefined();
    expect(screen.getByRole('button', { name: /Subscribe for 100 Stars\/month/i })).toBeDefined();
  });

  it('should render error content when fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Not Found', { status: 404 })
    );

    render(
      <Wrapper>
        <ProductCheckout
          startParam="buy_price_bad"
          error={<div data-testid="error">Error loading product</div>}
        />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error')).toBeDefined();
    });
  });

  it('should call error render function when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Server Error', { status: 500 })
    );

    render(
      <Wrapper>
        <ProductCheckout
          startParam="buy_price_bad"
          error={(err) => <div data-testid="error-fn">{err.message}</div>}
        />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-fn')).toBeDefined();
    });
  });
});
