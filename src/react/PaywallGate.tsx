import type { ReactNode } from 'react';
import { useSubscription } from './useSubscription.js';

export interface PaywallGateProps {
  /** Content to show when user has an active subscription */
  children: ReactNode;
  /** Content to show while checking subscription status */
  loading?: ReactNode;
  /** Content to show when user does not have an active subscription */
  fallback: ReactNode;
  /** Content to show when subscription check encounters an error */
  errorFallback?: ReactNode;
  /** Specific user ID to check (defaults to provider's telegramUserId) */
  userId?: number;
  /** Whether the user ID is still being resolved by the caller */
  userIdLoading?: boolean;
}

/**
 * Gates content behind a subscription check.
 *
 * When an API error occurs, always renders `errorFallback` if provided,
 * otherwise `fallback`. This is a fail-closed approach — errors never grant access.
 *
 * **Security note:** PaywallGate is a UX convenience for controlling what UI
 * is rendered client-side. It is NOT a security boundary. A determined user can
 * bypass client-side checks via browser DevTools. Always enforce access checks
 * server-side using `starspay.isActive()` or the subscription middleware.
 *
 * @example
 * ```tsx
 * <PaywallGate
 *   fallback={<SubscriptionPrompt />}
 *   errorFallback={<p>Unable to verify subscription. Please try again.</p>}
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
  errorFallback,
  userId,
  userIdLoading,
}: PaywallGateProps) {
  const { isActive, isLoading, error } = useSubscription(userId, { userIdLoading });

  if (isLoading) {
    return <>{loading ?? null}</>;
  }

  if (error) {
    return <>{errorFallback ?? fallback}</>;
  }

  if (!isActive) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
