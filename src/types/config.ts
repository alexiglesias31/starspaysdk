/** SDK configuration types */

export interface StarsPayConfig {
  /** API key from the StarsPay dashboard */
  apiKey: string;
  /** Telegram Bot API token */
  botToken: string;
  /** StarsPay backend URL (defaults to production) */
  apiUrl?: string;
  /** Default grace period for past_due subscriptions (seconds, default: 3 days) */
  gracePeriod?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface StarsPayClientConfig {
  /** API key from the StarsPay dashboard (publishable key) */
  apiKey: string;
  /** StarsPay backend URL (defaults to production) */
  apiUrl?: string;
}

/** Rate at which Stars convert to USD (approximate) */
export const STARS_TO_USD_RATE = 0.013;

/** Telegram Stars subscription period: exactly 30 days */
export const SUBSCRIPTION_PERIOD_SECONDS = 2592000;

/** Default grace period: 3 days */
export const DEFAULT_GRACE_PERIOD_SECONDS = 259200;

/** Currency code for Telegram Stars */
export const STARS_CURRENCY = 'XTR' as const;

/** Maximum subscription price per period */
export const MAX_SUBSCRIPTION_AMOUNT = 10000;

/** Minimum invoice amount */
export const MIN_INVOICE_AMOUNT = 1;
