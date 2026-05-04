import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { PaymentButton } from './PaymentButton.js';

export interface PurchaseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onError'> {
  /** Price ID for the one-time purchase */
  priceId: string;
  /** Called after successful payment */
  onSuccess?: () => void;
  /** Called when payment fails or is cancelled */
  onError?: (error: Error) => void;
  /** Button text */
  children?: ReactNode;
}

/**
 * Button that opens the Telegram Stars payment flow for a one-time purchase.
 *
 * @example
 * ```tsx
 * <PurchaseButton
 *   priceId="price_premium_access"
 *   onSuccess={() => unlockContent()}
 * >
 *   Buy for 50 Stars
 * </PurchaseButton>
 * ```
 */
export function PurchaseButton(props: PurchaseButtonProps) {
  return <PaymentButton {...props} defaultLabel="Purchase" />;
}
