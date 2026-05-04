/** SDK configuration types */

export interface ProviderConfig {
  /** Telegram Payments API providers (Stripe, YooKassa, etc.) */
  providers?: Record<string, { token: string; testToken?: string }>
}

export interface StarsPayConfig {
  /** Server API key from the StarsPay dashboard (`sp_live_...` or `sp_test_...`) */
  apiKey: string;
  /** Telegram Bot API token */
  botToken: string;
  /** StarsPay backend URL (defaults to production) */
  apiUrl?: string;
  /** Default grace period for past_due subscriptions (seconds, default: 3 days) */
  gracePeriod?: number;
  /** Enable debug logging */
  debug?: boolean;
  /**
   * Bypass subscription checks — `isActive()` always returns true.
   * Use this for development and testing only.
   */
  testMode?: boolean;
  /** Multi-payment provider configuration */
  payments?: ProviderConfig;
}

export interface StarsPayClientConfig {
  /** Publishable API key from the StarsPay dashboard (`sp_pub_...`) */
  apiKey: string;
  /** StarsPay backend URL (defaults to production) */
  apiUrl?: string;
  /**
   * Bypass subscription checks — `isActive()` always returns true.
   * Use this for development and testing only.
   */
  testMode?: boolean;
  /** Cache TTL in milliseconds (default: 30 000) */
  cacheTtl?: number;
}

/** Rate at which Stars convert to USD (approximate) */
export const STARS_TO_USD_RATE = 0.013;

/** Telegram Stars native recurring period: exactly 30 days. Only this period
 *  is supported by Telegram's `subscription_period` parameter. Other cadences
 *  (7d, 365d) are valid for fiat / crypto providers and are driven by the
 *  renewal-scheduler with one-time invoices. */
export const SUBSCRIPTION_PERIOD_SECONDS = 2592000;

/** Supported subscription cadences (period in seconds). */
export const SUBSCRIPTION_PERIODS = {
  /** 7 days — fiat / crypto only (Telegram Stars natively supports only 30d). */
  WEEKLY: 604800,
  /** 30 days — supported by every provider (the only Telegram Stars cadence). */
  MONTHLY: 2592000,
  /** 365 days — fiat / crypto only. */
  YEARLY: 31536000,
} as const;

/** Allow-list used at price create / update validation. */
export const SUBSCRIPTION_PERIOD_VALUES: readonly number[] = Object.values(SUBSCRIPTION_PERIODS);

/** The single cadence Telegram Stars's native `subscription_period` accepts. */
export const STARS_SUPPORTED_PERIOD = SUBSCRIPTION_PERIODS.MONTHLY;

/** Default renewal-reminder lead time, indexed by period seconds. The merchant
 *  may override per-product via `products.renewal_reminder_days_before`. */
export const DEFAULT_REMINDER_DAYS_BEFORE: Readonly<Record<number, number>> = {
  [SUBSCRIPTION_PERIODS.WEEKLY]: 1,    // 24 h before expiry
  [SUBSCRIPTION_PERIODS.MONTHLY]: 2,
  [SUBSCRIPTION_PERIODS.YEARLY]: 30,
};

/** Resolve the default reminder lead time for a given period, with a fallback
 *  used when a merchant uses a custom (non-standard) period. */
export function defaultReminderDaysFor(periodSeconds: number | null | undefined): number {
  if (!periodSeconds) return 2;
  const exact = DEFAULT_REMINDER_DAYS_BEFORE[periodSeconds];
  if (exact !== undefined) return exact;
  // Custom period: scale to ~7% of the period length, clamped to [1, 30].
  const days = Math.round(periodSeconds / 86400);
  return Math.min(30, Math.max(1, Math.round(days * 0.07)));
}

/** Default grace period: 3 days */
export const DEFAULT_GRACE_PERIOD_SECONDS = 259200;

/** Currency code for Telegram Stars */
export const STARS_CURRENCY = 'XTR' as const;

/** Maximum subscription price per period */
export const MAX_SUBSCRIPTION_AMOUNT = 10000;

/** Minimum invoice amount */
export const MIN_INVOICE_AMOUNT = 1;
