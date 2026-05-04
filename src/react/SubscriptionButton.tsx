import { useState, useCallback, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { useStarsPay } from './StarsPayProvider.js';

export interface SubscriptionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onError'> {
  /** Price ID to subscribe to */
  priceId: string;
  /** Called after successful payment */
  onSuccess?: () => void;
  /** Called when payment fails or is cancelled */
  onError?: (error: Error) => void;
  /** Button text */
  children?: ReactNode;
}

/**
 * Button that opens the Telegram Stars payment flow for a subscription.
 *
 * @example
 * ```tsx
 * <SubscriptionButton
 *   priceId="price_monthly_premium"
 *   onSuccess={() => router.push('/premium')}
 * >
 *   Subscribe for 100 Stars/month
 * </SubscriptionButton>
 * ```
 */
export function SubscriptionButton({
  priceId,
  onSuccess,
  onError,
  children,
  disabled,
  ...buttonProps
}: SubscriptionButtonProps) {
  const { client, telegramUserId } = useStarsPay();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (!telegramUserId) {
      onError?.(new Error('No Telegram user ID available'));
      return;
    }

    setIsLoading(true);

    try {
      const invoiceUrl = await client.createInvoiceLink({
        priceId,
        telegramUserId,
      });

      const status = await client.openPayment(invoiceUrl);

      if (status === 'paid') {
        client.invalidateUser(telegramUserId);
        onSuccess?.();
      } else if (status === 'failed') {
        onError?.(new Error('Payment failed'));
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client, telegramUserId, priceId, onSuccess, onError]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading || !telegramUserId}
      {...buttonProps}
    >
      {isLoading ? 'Processing...' : children ?? 'Subscribe'}
    </button>
  );
}
