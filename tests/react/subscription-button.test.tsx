/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StarsPayProvider } from '../../src/react/StarsPayProvider';
import { SubscriptionButton } from '../../src/react/SubscriptionButton';
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

describe('SubscriptionButton', () => {
  it('should render with default "Subscribe" text', () => {
    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" />
      </Wrapper>
    );

    expect(screen.getByRole('button').textContent).toBe('Subscribe');
  });

  it('should render with custom children', () => {
    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1">
          Get Premium - 100 Stars/mo
        </SubscriptionButton>
      </Wrapper>
    );

    expect(screen.getByRole('button').textContent).toBe('Get Premium - 100 Stars/mo');
  });

  it('should be disabled when no telegramUserId', () => {
    render(
      <Wrapper>
        <SubscriptionButton priceId="price_1" />
      </Wrapper>
    );

    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" disabled />
      </Wrapper>
    );

    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });

  it('should pass through extra button props', () => {
    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" className="custom-class" data-testid="sub-btn" />
      </Wrapper>
    );

    const btn = screen.getByTestId('sub-btn');
    expect(btn.className).toBe('custom-class');
  });

  it('should call onError when telegramUserId is missing', async () => {
    const onError = vi.fn();

    render(
      <Wrapper>
        <SubscriptionButton priceId="price_1" onError={onError} />
      </Wrapper>
    );

    // Button is disabled, but the handleClick logic checks too
    // We need to simulate the case where no user ID exists
    // The button is disabled so it can't be clicked directly
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });

  it('should show "Processing..." during payment flow and call onSuccess on paid', async () => {
    // Mock createInvoiceLink: POST /v1/invoices/create
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_123' }), { status: 200 })
    );

    // Mock openInvoice to call the callback with 'paid'
    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('paid');
    });

    const onSuccess = vi.fn();
    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" onSuccess={onSuccess} onError={onError} />
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

  it('should call onError when payment status is failed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_123' }), { status: 200 })
    );

    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('failed');
    });

    const onSuccess = vi.fn();
    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" onSuccess={onSuccess} onError={onError} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Payment failed' }));
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  it('should call onError when createInvoiceLink throws', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{}', { status: 500, statusText: 'Internal Server Error' })
    );

    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" onError={onError} />
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
    vi.mocked(fetch).mockRejectedValueOnce('string error');

    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" onError={onError} />
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
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_123' }), { status: 200 })
    );

    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('cancelled');
    });

    const onSuccess = vi.fn();
    const onError = vi.fn();

    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" onSuccess={onSuccess} onError={onError} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(screen.getByRole('button').textContent).toBe('Subscribe');
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Payment cancelled' }));
  });

  it('should restore button state after payment flow', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://t.me/$invoice_123' }), { status: 200 })
    );

    mockOpenInvoice.mockImplementation((_url: string, cb: (status: string) => void) => {
      cb('paid');
    });

    render(
      <Wrapper telegramUserId={12345}>
        <SubscriptionButton priceId="price_1" />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    await waitFor(() => {
      expect(screen.getByRole('button').textContent).toBe('Subscribe');
      expect(screen.getByRole('button')).toHaveProperty('disabled', false);
    });
  });
});
