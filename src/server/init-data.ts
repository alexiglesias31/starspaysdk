import { createHmac, timingSafeEqual } from 'node:crypto';
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

  // Validate hash is a valid hex string before comparison
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new StarsPayValidationError('Invalid initData hash');
  }

  // Use timing-safe comparison to prevent timing attacks
  const hashBuffer = Buffer.from(hash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');
  if (hashBuffer.length !== computedBuffer.length || !timingSafeEqual(hashBuffer, computedBuffer)) {
    throw new StarsPayValidationError('Invalid initData hash');
  }

  // Check auth_date staleness
  const authDateStr = params.get('auth_date');
  if (!authDateStr) {
    throw new StarsPayValidationError('Missing auth_date in initData');
  }
  const authDate = parseInt(authDateStr, 10);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new StarsPayValidationError('Invalid auth_date in initData');
  }
  const maxAge = options?.maxAgeSeconds ?? 3600; // Default: 1 hour
  const MAX_ALLOWED_AGE = 86400; // 24 hours
  if (!Number.isInteger(maxAge) || maxAge <= 0) {
    throw new StarsPayValidationError('maxAgeSeconds must be a positive integer');
  }
  if (maxAge > MAX_ALLOWED_AGE) {
    throw new StarsPayValidationError(`maxAgeSeconds cannot exceed ${MAX_ALLOWED_AGE} (24 hours)`);
  }
  const now = Math.floor(Date.now() / 1000);

  if (authDate > now + 30) {
    throw new StarsPayValidationError('initData auth_date is in the future');
  }

  if (now - authDate > maxAge) {
    throw new StarsPayValidationError(
      `initData expired: auth_date is ${now - authDate}s old (max: ${maxAge}s)`
    );
  }

  // Parse user data with safe JSON parsing
  const userStr = params.get('user');
  const user: WebAppUser | undefined = userStr ? safeJsonParse<WebAppUser>(userStr, 'user') : undefined;

  const receiverStr = params.get('receiver');
  const receiver: WebAppUser | undefined = receiverStr ? safeJsonParse<WebAppUser>(receiverStr, 'receiver') : undefined;

  const chatStr = params.get('chat');
  const chat = chatStr ? safeJsonParse<WebAppInitData['chat']>(chatStr, 'chat') : undefined;

  const rawChatType = params.get('chat_type');
  const VALID_CHAT_TYPES = ['sender', 'private', 'group', 'supergroup', 'channel'];
  const chat_type = rawChatType && VALID_CHAT_TYPES.includes(rawChatType)
    ? rawChatType as WebAppInitData['chat_type']
    : undefined;

  return {
    query_id: params.get('query_id') || undefined,
    user,
    receiver,
    chat,
    chat_type,
    chat_instance: params.get('chat_instance') || undefined,
    start_param: params.get('start_param') || undefined,
    can_send_after: params.has('can_send_after')
      ? (Number.isFinite(parseInt(params.get('can_send_after')!, 10))
        ? parseInt(params.get('can_send_after')!, 10)
        : undefined)
      : undefined,
    auth_date: authDate,
    hash,
    signature: params.get('signature') || undefined,
  };
}

function safeJsonParse<T>(value: string, fieldName: string): T {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new StarsPayValidationError(`initData field "${fieldName}" must be a JSON object`);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof StarsPayValidationError) throw err;
    throw new StarsPayValidationError(`Invalid JSON in initData field: ${fieldName}`);
  }
}

export class StarsPayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StarsPayValidationError';
  }
}
