/**
 * initData validation journey (11).
 *
 * Runs in-process — calls validateInitData() directly through the SDK rather
 * than through the harness server (the function is pure, no side effects).
 */
import { test, expect } from '@playwright/test';
import { validateInitData, StarsPayValidationError } from '@starspay/sdk/server';
import { makeInitDataString } from '../lib/webhook-payloads.ts';

const BOT_TOKEN = '123456789:HARNESS_BOT_TOKEN_AAAAAAAAAAAAAAAAAAAA';

test.describe('initData validation', () => {
  test('journey 11a: valid initData with current auth_date passes', async () => {
    test.info().annotations.push({ type: 'journey', description: '11a — valid initData' });
    const initData = makeInitDataString(BOT_TOKEN, {
      query_id: 'q1',
      user: JSON.stringify({ id: 7777, first_name: 'Test' }),
    });
    const data = validateInitData(initData, BOT_TOKEN);
    expect(data.user?.id).toBe(7777);
  });

  test('journey 11b: tampered initData fails', async () => {
    test.info().annotations.push({ type: 'journey', description: '11b — tampered initData' });
    const initData = makeInitDataString(BOT_TOKEN, {
      query_id: 'q1',
      user: JSON.stringify({ id: 7777, first_name: 'Test' }),
    });
    const tampered = initData.replace(/id%22%3A7777/, 'id%22%3A9999');
    expect(() => validateInitData(tampered, BOT_TOKEN)).toThrow(StarsPayValidationError);
  });

  test('journey 11c: expired initData fails (auth_date > 24h ago)', async () => {
    test.info().annotations.push({ type: 'journey', description: '11c — expired initData' });
    const oldAuthDate = String(Math.floor(Date.now() / 1000) - 25 * 3600);
    const initData = makeInitDataString(BOT_TOKEN, {
      auth_date: oldAuthDate,
      query_id: 'q1',
      user: JSON.stringify({ id: 7777, first_name: 'Test' }),
    });
    expect(() => validateInitData(initData, BOT_TOKEN, { maxAgeSeconds: 86400 })).toThrow(StarsPayValidationError);
  });
});
