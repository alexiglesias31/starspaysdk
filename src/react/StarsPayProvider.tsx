import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StarsPayClient } from '../client/starspay-client.js';
import type { StarsPayClientConfig } from '../types/config.js';

interface StarsPayContextValue {
  client: StarsPayClient;
  telegramUserId: number | null;
}

const StarsPayContext = createContext<StarsPayContextValue | null>(null);

export interface StarsPayProviderProps extends StarsPayClientConfig {
  children: ReactNode;
  /** Telegram user ID of the current user */
  telegramUserId?: number;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
}

/**
 * Provider component that makes the StarsPay client available throughout the app.
 *
 * @example
 * ```tsx
 * <StarsPayProvider apiKey="sp_live_..." telegramUserId={user.id}>
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
}: StarsPayProviderProps) {
  const client = useMemo(
    () => new StarsPayClient({ apiKey, apiUrl, cacheTtl }),
    [apiKey, apiUrl, cacheTtl]
  );

  const value = useMemo(
    () => ({ client, telegramUserId: telegramUserId ?? null }),
    [client, telegramUserId]
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
