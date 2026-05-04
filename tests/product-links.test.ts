import { describe, it, expect } from 'vitest';
import { generateProductLink, parseProductLink } from '../src/product-links';

describe('generateProductLink', () => {
  describe('mini_app type', () => {
    it('should generate a correct mini_app link', () => {
      const result = generateProductLink({
        botUsername: 'mybot',
        priceId: 'price_premium',
        type: 'mini_app',
        appShortName: 'myapp',
      });

      expect(result).toBe('https://t.me/mybot/myapp?startapp=buy_price_premium');
    });

    it('should handle a priceId containing underscores', () => {
      const result = generateProductLink({
        botUsername: 'mybot',
        priceId: 'price_monthly_premium',
        type: 'mini_app',
        appShortName: 'myapp',
      });

      expect(result).toBe('https://t.me/mybot/myapp?startapp=buy_price_monthly_premium');
    });

    it('should throw when appShortName is not provided for mini_app type', () => {
      expect(() =>
        generateProductLink({
          botUsername: 'mybot',
          priceId: 'price_premium',
          type: 'mini_app',
        })
      ).toThrow();
    });

    it('should throw when appShortName is an empty string for mini_app type', () => {
      expect(() =>
        generateProductLink({
          botUsername: 'mybot',
          priceId: 'price_premium',
          type: 'mini_app',
          appShortName: '',
        })
      ).toThrow();
    });
  });

  describe('bot_start type', () => {
    it('should generate a correct bot_start link', () => {
      const result = generateProductLink({
        botUsername: 'mybot',
        priceId: 'price_premium',
        type: 'bot_start',
      });

      expect(result).toBe('https://t.me/mybot?start=buy_price_premium');
    });

    it('should handle a priceId containing underscores for bot_start type', () => {
      const result = generateProductLink({
        botUsername: 'mybot',
        priceId: 'price_monthly_premium',
        type: 'bot_start',
      });

      expect(result).toBe('https://t.me/mybot?start=buy_price_monthly_premium');
    });

    it('should use botUsername directly without adding an @ prefix', () => {
      const result = generateProductLink({
        botUsername: 'CoolShopBot',
        priceId: 'plan_basic',
        type: 'bot_start',
      });

      expect(result).toContain('t.me/CoolShopBot');
      expect(result).not.toContain('@');
    });
  });

  describe('validation', () => {
    it('should throw when botUsername is empty', () => {
      expect(() =>
        generateProductLink({
          botUsername: '',
          priceId: 'price_premium',
          type: 'bot_start',
        })
      ).toThrow();
    });

    it('should throw when priceId is empty', () => {
      expect(() =>
        generateProductLink({
          botUsername: 'mybot',
          priceId: '',
          type: 'bot_start',
        })
      ).toThrow();
    });

    it('should throw when priceId is empty for mini_app type', () => {
      expect(() =>
        generateProductLink({
          botUsername: 'mybot',
          priceId: '',
          type: 'mini_app',
          appShortName: 'myapp',
        })
      ).toThrow();
    });

    it('should throw when botUsername contains invalid characters', () => {
      expect(() =>
        generateProductLink({
          botUsername: 'bot?startapp=evil',
          priceId: 'price_premium',
          type: 'bot_start',
        })
      ).toThrow('invalid characters');
    });

    it('should throw when appShortName contains invalid characters', () => {
      expect(() =>
        generateProductLink({
          botUsername: 'mybot',
          priceId: 'price_premium',
          type: 'mini_app',
          appShortName: 'app/../../evil',
        })
      ).toThrow('invalid characters');
    });
  });
});

describe('parseProductLink', () => {
  it('should parse a simple buy_priceId param', () => {
    const result = parseProductLink('buy_price_premium');

    expect(result).not.toBeNull();
    expect(result?.action).toBe('buy');
    expect(result?.priceId).toBe('price_premium');
  });

  it('should split on first underscore only, preserving underscores in priceId', () => {
    const result = parseProductLink('buy_price_monthly_premium');

    expect(result).not.toBeNull();
    expect(result?.action).toBe('buy');
    expect(result?.priceId).toBe('price_monthly_premium');
  });

  it('should reject unknown action prefixes (only "buy" is valid)', () => {
    const result = parseProductLink('subscribe_some_price');

    // Unknown action prefixes are rejected for security — only 'buy' is allowed.
    expect(result).toBeNull();
  });

  it('should parse a param where priceId has no underscores', () => {
    const result = parseProductLink('buy_basic');

    expect(result).not.toBeNull();
    expect(result?.action).toBe('buy');
    expect(result?.priceId).toBe('basic');
  });

  it('should return null for an empty string', () => {
    expect(parseProductLink('')).toBeNull();
  });

  it('should return null for a string with no underscore', () => {
    expect(parseProductLink('justtext')).toBeNull();
  });

  it('should return null when priceId is empty (string ends with underscore)', () => {
    expect(parseProductLink('buy_')).toBeNull();
  });

  it('should return null when action is empty (string starts with underscore)', () => {
    expect(parseProductLink('_price_premium')).toBeNull();
  });
});

describe('generateProductLink / parseProductLink roundtrip', () => {
  it('should roundtrip a mini_app link: generate then parse back to the same priceId', () => {
    const priceId = 'price_monthly_premium';

    const url = generateProductLink({
      botUsername: 'mybot',
      priceId,
      type: 'mini_app',
      appShortName: 'myapp',
    });

    const urlObj = new URL(url);
    const startapp = urlObj.searchParams.get('startapp');
    expect(startapp).not.toBeNull();

    const parsed = parseProductLink(startapp!);
    expect(parsed).not.toBeNull();
    expect(parsed?.priceId).toBe(priceId);
    expect(parsed?.action).toBe('buy');
  });

  it('should roundtrip a bot_start link: generate then parse back to the same priceId', () => {
    const priceId = 'price_annual_pro';

    const url = generateProductLink({
      botUsername: 'mybot',
      priceId,
      type: 'bot_start',
    });

    const urlObj = new URL(url);
    const start = urlObj.searchParams.get('start');
    expect(start).not.toBeNull();

    const parsed = parseProductLink(start!);
    expect(parsed).not.toBeNull();
    expect(parsed?.priceId).toBe(priceId);
    expect(parsed?.action).toBe('buy');
  });
});
