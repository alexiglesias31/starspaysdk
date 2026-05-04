import { useState, useCallback, useRef, useEffect, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { useStarsPay } from './StarsPayProvider.js';

export interface PaymentButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onError'> {
  /** Price ID for the payment */
  priceId: string;
  /** Called after successful payment */
  onSuccess?: () => void;
  /** Called when payment fails or is cancelled */
  onError?: (error: Error) => void;
  /** Button text */
  children?: ReactNode;
  /** Label to show when children is not provided */
  defaultLabel: string;
}

/**
 * Internal shared implementation for PurchaseButton and SubscriptionButton.
 * Not exported as part of the public API — use PurchaseButton or SubscriptionButton instead.
 */
export function PaymentButton({
  priceId,
  onSuccess,
  onError,
  children,
  disabled,
  defaultLabel,
  ...buttonProps
}: PaymentButtonProps) {
  const { client, telegramUserId } = useStarsPay();
  const [isLoading, setIsLoading] = useState(false);
  const unmountedRef = useRef(false);
  const isInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (isInFlightRef.current) return;
    if (!telegramUserId) {
      onError?.(new Error('No Telegram user ID available'));
      return;
    }

    isInFlightRef.current = true;
    setIsLoading(true);

    try {
      const invoiceUrl = await client.createInvoiceLink({
        priceId,
        telegramUserId,
      });

      const status = await client.openPayment(invoiceUrl);

      if (unmountedRef.current) return;

      if (status === 'paid') {
        client.invalidateUser(telegramUserId);
        onSuccess?.();
      } else if (status === 'cancelled') {
        onError?.(new Error('Payment cancelled'));
      } else if (status === 'failed') {
        onError?.(new Error('Payment failed'));
      } else if (status === 'pending') {
        onError?.(new Error('Payment pending'));
      }
    } catch (err) {
      if (unmountedRef.current) return;
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      isInFlightRef.current = false;
      if (!unmountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [client, telegramUserId, priceId, onSuccess, onError]);

  return (
    <button
      {...buttonProps}
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading || !telegramUserId}
      aria-busy={isLoading}
      aria-label={isLoading ? 'Processing payment...' : undefined}
    >
      {isLoading ? 'Processing...' : children ?? defaultLabel}
    </button>
  );
}
