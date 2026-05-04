import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StarsPayClient } from '../client/starspay-client.js';
import type { StarsPayClientConfig } from '../types/config.js';

interface StarsPayContextValue {
  client: StarsPayClient;
  telegramUserId: number | null;
  testMode: boolean;
}

const StarsPayContext = createContext<StarsPayContextValue | null>(null);

export interface StarsPayProviderProps extends StarsPayClientConfig {
  children: ReactNode;
  /** Telegram user ID of the current user */
  telegramUserId?: number;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  /**
   * Bypass subscription checks — all gates and hooks treat the user as subscribed.
   * Use this for development and testing only.
   */
  testMode?: boolean;
}

/**
 * Provider component that makes the StarsPay client available throughout the app.
 *
 * @example
 * ```tsx
 * <StarsPayProvider apiKey="sp_pub_..." telegramUserId={user.id}>
 *   <App />
 * </StarsPayProvider>
 * ```
 */
export function StarsPayProvider({
  children,
  apiKey,
  apiUrl,
  telegramUserId,
  cacheTtl,
  testMode,
}: StarsPayProviderProps) {
  const resolvedTestMode = testMode ?? false;

  const client = useMemo(
    () => new StarsPayClient({ apiKey, apiUrl, cacheTtl, testMode: resolvedTestMode }),
    [apiKey, apiUrl, cacheTtl, resolvedTestMode]
  );

  const value = useMemo(
    () => ({ client, telegramUserId: telegramUserId ?? null, testMode: resolvedTestMode }),
    [client, telegramUserId, resolvedTestMode]
  );

  return (
    <StarsPayContext.Provider value={value}>
      {children}
    </StarsPayContext.Provider>
  );
}

/**
 * Hook to access the StarsPay client.
 */
export function useStarsPay(): StarsPayContextValue {
  const context = useContext(StarsPayContext);
  if (!context) {
    throw new Error('useStarsPay must be used within a <StarsPayProvider>');
  }
  return context;
}
