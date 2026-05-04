import { describe, it, expect } from 'vitest';
import {
  STARS_TO_USD_RATE,
  SUBSCRIPTION_PERIOD_SECONDS,
  SUBSCRIPTION_PERIODS,
  SUBSCRIPTION_PERIOD_VALUES,
  STARS_SUPPORTED_PERIOD,
  DEFAULT_REMINDER_DAYS_BEFORE,
  defaultReminderDaysFor,
  DEFAULT_GRACE_PERIOD_SECONDS,
  STARS_CURRENCY,
  MAX_SUBSCRIPTION_AMOUNT,
  MIN_INVOICE_AMOUNT,
} from '../../src/types/config';

describe('Config constants', () => {
  it('should have correct Stars to USD rate', () => {
    expect(STARS_TO_USD_RATE).toBe(0.013);
  });

  it('should have correct subscription period (30 days in seconds)', () => {
    expect(SUBSCRIPTION_PERIOD_SECONDS).toBe(2592000);
    expect(SUBSCRIPTION_PERIOD_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it('should have correct default grace period (3 days in seconds)', () => {
    expect(DEFAULT_GRACE_PERIOD_SECONDS).toBe(259200);
    expect(DEFAULT_GRACE_PERIOD_SECONDS).toBe(3 * 24 * 60 * 60);
  });

  it('should use XTR as Stars currency', () => {
    expect(STARS_CURRENCY).toBe('XTR');
  });

  it('should have correct max subscription amount', () => {
    expect(MAX_SUBSCRIPTION_AMOUNT).toBe(10000);
  });

  it('should have correct min invoice amount', () => {
    expect(MIN_INVOICE_AMOUNT).toBe(1);
  });
});

describe('Subscription period constants', () => {
  it('exposes the three supported cadences with correct seconds', () => {
    expect(SUBSCRIPTION_PERIODS.WEEKLY).toBe(7 * 24 * 60 * 60);
    expect(SUBSCRIPTION_PERIODS.MONTHLY).toBe(30 * 24 * 60 * 60);
    expect(SUBSCRIPTION_PERIODS.YEARLY).toBe(365 * 24 * 60 * 60);
  });

  it('SUBSCRIPTION_PERIOD_SECONDS is the monthly value (backwards compat alias)', () => {
    expect(SUBSCRIPTION_PERIOD_SECONDS).toBe(SUBSCRIPTION_PERIODS.MONTHLY);
  });

  it('SUBSCRIPTION_PERIOD_VALUES contains exactly the three supported cadences', () => {
    expect([...SUBSCRIPTION_PERIOD_VALUES].sort((a, b) => a - b)).toEqual([
      604800, 2592000, 31536000,
    ]);
  });

  it('STARS_SUPPORTED_PERIOD is the only Telegram-Stars cadence (30 days)', () => {
    expect(STARS_SUPPORTED_PERIOD).toBe(SUBSCRIPTION_PERIODS.MONTHLY);
  });
});

describe('DEFAULT_REMINDER_DAYS_BEFORE', () => {
  it('weekly subscriptions default to a 1-day (24h) reminder lead', () => {
    expect(DEFAULT_REMINDER_DAYS_BEFORE[SUBSCRIPTION_PERIODS.WEEKLY]).toBe(1);
  });

  it('monthly subscriptions default to a 2-day reminder lead', () => {
    expect(DEFAULT_REMINDER_DAYS_BEFORE[SUBSCRIPTION_PERIODS.MONTHLY]).toBe(2);
  });

  it('yearly subscriptions default to a 30-day reminder lead', () => {
    expect(DEFAULT_REMINDER_DAYS_BEFORE[SUBSCRIPTION_PERIODS.YEARLY]).toBe(30);
  });
});

describe('defaultReminderDaysFor', () => {
  it('returns the canonical lead time for each supported cadence', () => {
    expect(defaultReminderDaysFor(SUBSCRIPTION_PERIODS.WEEKLY)).toBe(1);
    expect(defaultReminderDaysFor(SUBSCRIPTION_PERIODS.MONTHLY)).toBe(2);
    expect(defaultReminderDaysFor(SUBSCRIPTION_PERIODS.YEARLY)).toBe(30);
  });

  it('falls back to 2 days when the period is null or undefined (legacy rows)', () => {
    expect(defaultReminderDaysFor(null)).toBe(2);
    expect(defaultReminderDaysFor(undefined)).toBe(2);
    expect(defaultReminderDaysFor(0)).toBe(2);
  });

  it('clamps to [1, 30] for non-canonical custom periods', () => {
    // 90 days * 0.07 ≈ 6.3 → 6
    expect(defaultReminderDaysFor(90 * 86400)).toBe(6);
    // 1 day * 0.07 ≈ 0.07 → clamps up to 1
    expect(defaultReminderDaysFor(1 * 86400)).toBe(1);
    // 1000 days * 0.07 = 70 → clamps down to 30
    expect(defaultReminderDaysFor(1000 * 86400)).toBe(30);
  });
});
