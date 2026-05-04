import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { PaymentButton } from './PaymentButton.js';

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
export function SubscriptionButton(props: SubscriptionButtonProps) {
  return <PaymentButton {...props} defaultLabel="Subscribe" />;
}
