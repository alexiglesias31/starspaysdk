/**
 * Product link helpers journey (17).
 */
import { test, expect } from '@playwright/test';
import { generateProductLink, parseProductLink } from '@starspay/sdk';

test.describe('product links', () => {
  test('journey 17: generate → parse round-trip for bot_start type', async () => {
    test.info().annotations.push({ type: 'journey', description: '17 — product link round-trip' });
    const url = generateProductLink({
      botUsername: 'mybot',
      priceId: 'price_premium_monthly',
      type: 'bot_start',
    });
    expect(url).toBe('https://t.me/mybot?start=buy_price_premium_monthly');

    // The /start payload that arrives on the bot side is the part after
    // `start=`, which is `buy_<priceId>`.
    const parsed = parseProductLink('buy_price_premium_monthly');
    expect(parsed?.priceId).toBe('price_premium_monthly');
  });
});
