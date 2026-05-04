import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { validateInitData, StarsPayValidationError } from '../../src/server/init-data';

const BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

function createValidInitData(
  params: Record<string, string>,
  token: string = BOT_TOKEN
): string {
  // Build data-check-string
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Derive secret key
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();

  // Compute hash
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Build query string
  const searchParams = new URLSearchParams({ ...params, hash });
  return searchParams.toString();
}

describe('validateInitData', () => {
  it('should validate correct initData', () => {
    const user = JSON.stringify({ id: 123, first_name: 'Test', username: 'testuser' });
    const authDate = Math.floor(Date.now() / 1000).toString();

    const initData = createValidInitData({
      user,
      auth_date: authDate,
      query_id: 'test_query',
    });

    const result = validateInitData(initData, BOT_TOKEN);

    expect(result.user).toBeDefined();
    expect(result.user?.id).toBe(123);
    expect(result.user?.first_name).toBe('Test');
    expect(result.user?.username).toBe('testuser');
    expect(result.auth_date).toBe(parseInt(authDate));
    expect(result.query_id).toBe('test_query');
  });

  it('should throw on missing hash', () => {
    expect(() =>
      validateInitData('user=test&auth_date=123', BOT_TOKEN)
    ).toThrow(StarsPayValidationError);
    expect(() =>
      validateInitData('user=test&auth_date=123', BOT_TOKEN)
    ).toThrow('Missing hash');
  });

  it('should throw on invalid hash', () => {
    const initData = 'user=test&auth_date=123&hash=invalidhash';
    expect(() => validateInitData(initData, BOT_TOKEN)).toThrow('Invalid initData hash');
  });

  it('should throw on expired auth_date', () => {
    const oldAuthDate = (Math.floor(Date.now() / 1000) - 100000).toString();
    const initData = createValidInitData({
      auth_date: oldAuthDate,
    });

    expect(() => validateInitData(initData, BOT_TOKEN)).toThrow('initData expired');
  });

  it('should accept custom maxAgeSeconds', () => {
    const recentAuthDate = (Math.floor(Date.now() / 1000) - 10).toString();
    const initData = createValidInitData({
      auth_date: recentAuthDate,
    });

    // Should succeed with default (3600s)
    const result = validateInitData(initData, BOT_TOKEN);
    expect(result.auth_date).toBe(parseInt(recentAuthDate));

    // Should fail with tight maxAge
    const oldAuthDate = (Math.floor(Date.now() / 1000) - 100).toString();
    const oldInitData = createValidInitData({
      auth_date: oldAuthDate,
    });
    expect(() =>
      validateInitData(oldInitData, BOT_TOKEN, { maxAgeSeconds: 50 })
    ).toThrow('initData expired');
  });

  it('should parse all WebAppInitData fields', () => {
    const user = JSON.stringify({
      id: 456,
      first_name: 'Alice',
      last_name: 'Smith',
      username: 'alice',
      language_code: 'en',
      is_premium: true,
    });
    const chat = JSON.stringify({ id: 789, type: 'private' });
    const authDate = Math.floor(Date.now() / 1000).toString();

    const initData = createValidInitData({
      user,
      chat,
      auth_date: authDate,
      chat_type: 'private',
      chat_instance: 'test_instance',
      start_param: 'ref_123',
    });

    const result = validateInitData(initData, BOT_TOKEN);

    expect(result.user?.id).toBe(456);
    expect(result.user?.is_premium).toBe(true);
    expect(result.user?.language_code).toBe('en');
    expect(result.chat?.id).toBe(789);
    expect(result.chat_type).toBe('private');
    expect(result.chat_instance).toBe('test_instance');
    expect(result.start_param).toBe('ref_123');
  });

  it('should handle initData without user', () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const initData = createValidInitData({
      auth_date: authDate,
    });

    const result = validateInitData(initData, BOT_TOKEN);
    expect(result.user).toBeUndefined();
  });

  it('should reject with wrong bot token', () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const initData = createValidInitData({
      auth_date: authDate,
    });

    expect(() =>
      validateInitData(initData, 'wrong:token')
    ).toThrow('Invalid initData hash');
  });
});
