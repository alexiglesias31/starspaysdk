/**
 * Types and utilities for product embed links.
 * These allow non-technical users to share purchasable products
 * via Telegram deep links in channels, groups, and DMs.
 */

export type ProductLinkType = 'mini_app' | 'bot_start';

export interface ProductLinkOptions {
  /** The bot username (without @) */
  botUsername: string;
  /** The price ID to encode in the link */
  priceId: string;
  /** Link type: mini_app opens the TMA, bot_start opens a DM with the bot */
  type: ProductLinkType;
  /** Mini App short name (required when type is 'mini_app') */
  appShortName?: string;
}

export interface ParsedProductLink {
  /** The price ID extracted from the link parameter */
  priceId: string;
  /** The action prefix (currently always 'buy') */
  action: string;
}

/**
 * Generate a Telegram deep link for a product.
 *
 * For `mini_app`: returns `https://t.me/{botUsername}/{appShortName}?startapp=buy_{priceId}`
 * For `bot_start`: returns `https://t.me/{botUsername}?start=buy_{priceId}`
 */
/** Validates that a string is a valid Telegram bot username or app short name. */
function isValidTelegramIdentifier(value: string): boolean {
  return /^[a-zA-Z0-9_]{1,64}$/.test(value);
}

export function generateProductLink(options: ProductLinkOptions): string {
  if (!options.botUsername) {
    throw new Error('botUsername is required');
  }

  if (!isValidTelegramIdentifier(options.botUsername)) {
    throw new Error('botUsername contains invalid characters (only alphanumeric and underscores allowed)');
  }

  if (!options.priceId) {
    throw new Error('priceId is required');
  }

  if (options.type === 'mini_app') {
    if (!options.appShortName) {
      throw new Error('appShortName is required when type is "mini_app"');
    }
    if (!isValidTelegramIdentifier(options.appShortName)) {
      throw new Error('appShortName contains invalid characters (only alphanumeric and underscores allowed)');
    }
    return `https://t.me/${encodeURIComponent(options.botUsername)}/${encodeURIComponent(options.appShortName)}?startapp=buy_${encodeURIComponent(options.priceId)}`;
  }

  return `https://t.me/${encodeURIComponent(options.botUsername)}?start=buy_${encodeURIComponent(options.priceId)}`;
}

/**
 * Parse a start or startapp parameter value into a product link payload.
 *
 * Expected format: `buy_{priceId}` (e.g., `buy_price_monthly_premium`).
 * Splits on the first underscore only, since price IDs may contain underscores.
 *
 * @returns The parsed product link, or `null` if the format doesn't match.
 */
export function parseProductLink(startParam: string): ParsedProductLink | null {
  if (!startParam) return null;

  const separatorIndex = startParam.indexOf('_');
  if (separatorIndex === -1) return null;

  const action = startParam.slice(0, separatorIndex);
  const priceId = startParam.slice(separatorIndex + 1);

  if (!action || !priceId) return null;

  // Only accept known action prefixes to prevent unexpected behavior
  const VALID_ACTIONS = ['buy'];
  if (!VALID_ACTIONS.includes(action)) return null;

  return { action, priceId };
}
