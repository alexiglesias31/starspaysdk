/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StarsPayProvider } from '../../src/react/StarsPayProvider';
import { PurchaseButton } from '../../src/react/PurchaseButton';
import type { ReactNode } from 'react';

// Mock the Telegram WebApp SDK
const mockOpenInvoice = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('Telegram', {
    WebApp: {
      openInvoice: mockOpenInvoice,
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Wrapper({ children, telegramUserId }: { children: ReactNode; telegramUserId?: number }) {
  return (
    <StarsPayProvider apiKey="sp_pub_123" telegramUserId={telegramUserId}>
      {children}
    </StarsPayProvider>
  );
}

describe('PurchaseButton', () => {
  it('should render with default "Purchase" text', () => {
    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" />
      </Wrapper>
    );

    expect(screen.getByRole('button').textContent).toBe('Purchase');
  });

  it('should render with custom children', () => {
    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1">
          Buy for 50 Stars
        </PurchaseButton>
      </Wrapper>
    );

    expect(screen.getByRole('button').textContent).toBe('Buy for 50 Stars');
  });

  it('should be disabled when no telegramUserId', () => {
    render(
      <Wrapper>
        <PurchaseButton priceId="price_1" />
      </Wrapper>
    );

    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" disabled />
      </Wrapper>
    );

    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });

  it('should pass through extra button props', () => {
    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" className="buy-btn" data-testid="purchase-btn" />
      </Wrapper>
    );

    const btn = screen.getByTestId('purchase-btn');
    expect(btn.className).toBe('buy-btn');
  });

  it('should show "Processing..." during payment flow and call onSuccess on paid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_456' }), { status: 200 })
    );

    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('paid');
    });

    const onSuccess = vi.fn();
    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" onSuccess={onSuccess} onError={onError} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  it('should call invalidateUser on success to refresh subscription cache', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_456' }), { status: 200 })
    );

    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('paid');
    });

    const onSuccess = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" onSuccess={onSuccess} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('should call onError when payment status is failed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_456' }), { status: 200 })
    );

    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('failed');
    });

    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" onError={onError} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Payment failed' }));
    });
  });

  it('should call onError when createInvoiceLink throws', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{}', { status: 500, statusText: 'Internal Server Error' })
    );

    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" onError={onError} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it('should handle non-Error exceptions', async () => {
    vi.mocked(fetch).mockRejectedValueOnce('purchase failed');

    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" onError={onError} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it('should call onError when payment is cancelled', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_456' }), { status: 200 })
    );

    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('cancelled');
    });

    const onSuccess = vi.fn();
    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" onSuccess={onSuccess} onError={onError} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(screen.getByRole('button').textContent).toBe('Purchase');
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Payment cancelled' }));
  });

  it('should restore button state after payment flow completes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_456' }), { status: 200 })
    );

    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('paid');
    });

    render(
      <Wrapper telegramUserId={12345}>
        <PurchaseButton priceId="price_1" />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(screen.getByRole('button').textContent).toBe('Purchase');
      expect(screen.getByRole('button')).toHaveProperty('disabled', false);
    });
  });
});
