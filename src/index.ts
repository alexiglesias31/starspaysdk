/**
 * @starspay/sdk - Telegram Stars Payment SDK
 *
 * Shared types and constants. Import server-side code from '@starspay/sdk/server'
 * and client-side code from '@starspay/sdk/client' or '@starspay/sdk/react'.
 */

export * from './types/index.js';

export { generateProductLink, parseProductLink } from './product-links.js';
export type { ProductLinkType, ProductLinkOptions, ParsedProductLink } from './product-links.js';
export { TxLimitExceededError } from './errors/tx-limit-exceeded-error.js';
