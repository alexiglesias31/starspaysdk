import { createHmac } from 'node:crypto';
import type { WebAppInitData, WebAppUser } from '../types/telegram.js';

/**
 * Validates Telegram Mini App initData using HMAC-SHA256.
 *
 * Algorithm:
 * 1. Parse initData as URL query params, extract and remove `hash`
 * 2. Sort remaining params alphabetically, join with \n as key=value
 * 3. Derive secret: HMAC-SHA256("WebAppData", botToken) — "WebAppData" is the key
 * 4. Compute: HMAC-SHA256(dataCheckString, secretKey)
 * 5. Compare computed hash with extracted hash
 */
export function validateInitData(
  initDataRaw: string,
  botToken: string,
  options?: { maxAgeSeconds?: number }
): WebAppInitData {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');

  if (!hash) {
    throw new StarsPayValidationError('Missing hash in initData');
  }

  params.delete('hash');

  // Build data-check-string: sorted key=value pairs joined by \n
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Derive secret key: HMAC-SHA256(botToken, "WebAppData")
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

  // Compute hash: HMAC-SHA256(dataCheckString, secretKey)
  const computedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    throw new StarsPayValidationError('Invalid initData hash');
  }

  // Check auth_date staleness
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const maxAge = options?.maxAgeSeconds ?? 86400; // Default: 1 day
  const now = Math.floor(Date.now() / 1000);

  if (now - authDate > maxAge) {
    throw new StarsPayValidationError(
      `initData expired: auth_date is ${now - authDate}s old (max: ${maxAge}s)`
    );
  }

  // Parse user data
  const userStr = params.get('user');
  const user: WebAppUser | undefined = userStr ? JSON.parse(userStr) : undefined;

  const receiverStr = params.get('receiver');
  const receiver: WebAppUser | undefined = receiverStr ? JSON.parse(receiverStr) : undefined;

  const chatStr = params.get('chat');
  const chat = chatStr ? JSON.parse(chatStr) : undefined;

  return {
    query_id: params.get('query_id') || undefined,
    user,
    receiver,
    chat,
    chat_type: params.get('chat_type') as WebAppInitData['chat_type'],
    chat_instance: params.get('chat_instance') || undefined,
    start_param: params.get('start_param') || undefined,
    can_send_after: params.has('can_send_after')
      ? parseInt(params.get('can_send_after')!, 10)
      : undefined,
    auth_date: authDate,
    hash,
    signature: params.get('signature') || undefined,
  };
}

export class StarsPayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StarsPayValidationError';
  }
}
