/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StarsPayProvider, useStarsPay } from '../../src/react/StarsPayProvider';
import { PaywallGate } from '../../src/react/PaywallGate';
import type { ReactNode } from 'react';

// Mock fetch for all tests
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function TestConsumer() {
  const { client, telegramUserId } = useStarsPay();
  return (
    <div>
      <span data-testid="user-id">{telegramUserId}</span>
      <span data-testid="client-exists">{client ? 'yes' : 'no'}</span>
    </div>
  );
}

describe('StarsPayProvider', () => {
  it('should provide client and telegramUserId to children', () => {
    render(
      <StarsPayProvider apiKey="sp_pub_123" telegramUserId={12345}>
        <TestConsumer />
      </StarsPayProvider>
    );

    expect(screen.getByTestId('user-id').textContent).toBe('12345');
    expect(screen.getByTestId('client-exists').textContent).toBe('yes');
  });

  it('should provide null userId when not set', () => {
    render(
      <StarsPayProvider apiKey="sp_pub_123">
        <TestConsumer />
      </StarsPayProvider>
    );

    expect(screen.getByTestId('user-id').textContent).toBe('');
  });

  it('should throw when useStarsPay is used outside provider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      'useStarsPay must be used within a <StarsPayProvider>'
    );

    spy.mockRestore();
  });
});

describe('PaywallGate', () => {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StarsPayProvider apiKey="sp_pub_123" telegramUserId={12345}>
        {children}
      </StarsPayProvider>
    );
  }

  it('should show loading state initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {})); // Never resolves

    render(
      <Wrapper>
        <PaywallGate
          loading={<div data-testid="loading">Loading...</div>}
          fallback={<div data-testid="paywall">Upgrade</div>}
        >
          <div data-testid="content">Premium Content</div>
        </PaywallGate>
      </Wrapper>
    );

    expect(screen.getByTestId('loading')).toBeDefined();
  });

  it('should stay in loading state while the caller is still resolving the user ID', () => {
    render(
      <StarsPayProvider apiKey="sp_pub_123">
        <PaywallGate
          loading={<div data-testid="loading">Loading...</div>}
          fallback={<div data-testid="paywall">Upgrade</div>}
          userIdLoading
        >
          <div data-testid="content">Premium Content</div>
        </PaywallGate>
      </StarsPayProvider>
    );

    expect(screen.getByTestId('loading')).toBeDefined();
    expect(screen.queryByTestId('paywall')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should show content when subscription is active', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ active: true, subscription: { id: 'sub_1', status: 'active' } }),
        { status: 200 }
      )
    );

    render(
      <Wrapper>
        <PaywallGate
          loading={<div data-testid="loading">Loading...</div>}
          fallback={<div data-testid="paywall">Upgrade</div>}
        >
          <div data-testid="content">Premium Content</div>
        </PaywallGate>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeDefined();
    });
  });

  it('should show fallback when no subscription', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ active: false, subscription: null }), { status: 200 })
    );

    render(
      <Wrapper>
        <PaywallGate
          loading={<div data-testid="loading">Loading...</div>}
          fallback={<div data-testid="paywall">Upgrade</div>}
        >
          <div data-testid="content">Premium Content</div>
        </PaywallGate>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('paywall')).toBeDefined();
    });
  });

  it('should close the gate when the provider loses its telegram user id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ active: true, subscription: { id: 'sub_1', status: 'active' } }),
        { status: 200 }
      )
    );

    const { rerender } = render(
      <StarsPayProvider apiKey="sp_pub_123" telegramUserId={12345}>
        <PaywallGate
          loading={<div data-testid="loading">Loading...</div>}
          fallback={<div data-testid="paywall">Upgrade</div>}
        >
          <div data-testid="content">Premium Content</div>
        </PaywallGate>
      </StarsPayProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeDefined();
    });

    rerender(
      <StarsPayProvider apiKey="sp_pub_123">
        <PaywallGate
          loading={<div data-testid="loading">Loading...</div>}
          fallback={<div data-testid="paywall">Upgrade</div>}
        >
          <div data-testid="content">Premium Content</div>
        </PaywallGate>
      </StarsPayProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('paywall')).toBeDefined();
    });
  });
});
