import { useState, useEffect, useCallback, useRef } from 'react';
import type { Subscription } from '../types/subscription.js';
import { useStarsPay } from './StarsPayProvider.js';
import { isEntitled } from '../client/index.js';

export interface UseSubscriptionResult {
  isActive: boolean;
  isLoading: boolean;
  error: Error | null;
  subscription: Subscription | null;
  refresh: () => Promise<void>;
}

export interface UseSubscriptionOptions {
  userIdLoading?: boolean;
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
export function useSubscription(userId?: number, options?: UseSubscriptionOptions): UseSubscriptionResult {
  const { client, telegramUserId, testMode } = useStarsPay();
  const targetUserId = userId ?? telegramUserId;
  const userIdLoading = options?.userIdLoading ?? false;

  const [isActive, setIsActive] = useState(testMode);
  const [isLoading, setIsLoading] = useState(!testMode);
  const [error, setError] = useState<Error | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const unmountedRef = useRef(false);
  // Monotonic counter: each fetch call increments this; a result is only applied
  // if its captured ID still matches, preventing stale responses from overwriting
  // fresher ones regardless of whether the call came from the effect or refresh().
  const fetchIdRef = useRef(0);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const fetchSubscription = useCallback(async () => {
    if (testMode) return;

    if (userIdLoading) {
      fetchIdRef.current += 1;
      setIsActive(false);
      setSubscription(null);
      setError(null);
      setIsLoading(true);
      return;
    }

    if (!targetUserId) {
      fetchIdRef.current += 1;
      setIsActive(false);
      setSubscription(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    fetchIdRef.current += 1;
    const thisFetchId = fetchIdRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const sub = await client.getActiveSubscription(targetUserId);
      if (fetchIdRef.current === thisFetchId && !unmountedRef.current) {
        setSubscription(sub);
        setIsActive(isEntitled(sub));
      }
    } catch (err) {
      if (fetchIdRef.current === thisFetchId && !unmountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsActive(false);
        setSubscription(null);
      }
    } finally {
      if (fetchIdRef.current === thisFetchId && !unmountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [client, targetUserId, testMode, userIdLoading]);

  const refresh = useCallback(async () => {
    return fetchSubscription();
  }, [fetchSubscription]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Reset state when testMode changes
  useEffect(() => {
    if (testMode) {
      fetchIdRef.current += 1; // invalidate any in-flight fetch
      setIsActive(true);
      setIsLoading(false);
      setSubscription(null);
      setError(null);
    } else {
      // Fail-closed: reset to loading state when leaving testMode
      setIsActive(false);
      setIsLoading(true);
      setSubscription(null);
      setError(null);
    }
  }, [testMode]);

  return { isActive, isLoading, error, subscription, refresh };
}
