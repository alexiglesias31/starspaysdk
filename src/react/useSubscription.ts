import { useState, useEffect, useCallback } from 'react';
import type { Subscription } from '../types/subscription.js';
import { useStarsPay } from './StarsPayProvider.js';

export interface UseSubscriptionResult {
  isActive: boolean;
  isLoading: boolean;
  error: Error | null;
  subscription: Subscription | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to check subscription status for the current user.
 *
 * @example
 * ```tsx
 * const { isActive, isLoading, subscription } = useSubscription();
 * if (isLoading) return <Spinner />;
 * if (!isActive) return <Paywall />;
 * return <PremiumContent />;
 * ```
 */
export function useSubscription(userId?: number): UseSubscriptionResult {
  const { client, telegramUserId } = useStarsPay();
  const targetUserId = userId ?? telegramUserId;

  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const refresh = useCallback(async () => {
    if (!targetUserId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sub = await client.getActiveSubscription(targetUserId);
      setSubscription(sub);
      setIsActive(!!sub);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsActive(false);
      setSubscription(null);
    } finally {
      setIsLoading(false);
    }
  }, [client, targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { isActive, isLoading, error, subscription, refresh };
}
