import type { ReactNode } from 'react';
import { useSubscription } from './useSubscription.js';

export interface PaywallGateProps {
  /** Content to show when user has an active subscription */
  children: ReactNode;
  /** Content to show while checking subscription status */
  loading?: ReactNode;
  /** Content to show when user does not have an active subscription */
  fallback: ReactNode;
  /** Specific user ID to check (defaults to provider's telegramUserId) */
  userId?: number;
}

/**
 * Gates content behind a subscription check.
 *
 * @example
 * ```tsx
 * <PaywallGate
 *   fallback={<SubscriptionPrompt />}
 *   loading={<Spinner />}
 * >
 *   <PremiumContent />
 * </PaywallGate>
 * ```
 */
export function PaywallGate({
  children,
  loading,
  fallback,
  userId,
}: PaywallGateProps) {
  const { isActive, isLoading } = useSubscription(userId);

  if (isLoading) {
    return <>{loading ?? null}</>;
  }

  if (!isActive) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
