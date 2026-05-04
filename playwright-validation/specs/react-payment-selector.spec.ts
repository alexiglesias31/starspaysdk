/**
 * PaymentMethodSelector journey (16).
 */
import { test, expect } from '@playwright/test';

test.describe('<PaymentMethodSelector />', () => {
  test('journey 16a: only stars + telegram_payments render', async ({ page }) => {
    test.info().annotations.push({ type: 'journey', description: '16a — selector renders supported providers' });
    await page.goto('/payment-method-selector');
    await expect(page.getByRole('radio', { name: 'Telegram Stars' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Card (via Telegram Payments)' })).toBeVisible();
    expect(await page.getByRole('radio').count()).toBe(2);
  });

  test('journey 16b: clicking telegram_payments updates aria-pressed', async ({ page }) => {
    test.info().annotations.push({ type: 'journey', description: '16b — selector updates state on click' });
    await page.goto('/payment-method-selector');
    const card = page.getByRole('radio', { name: 'Card (via Telegram Payments)' });
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('radio', { name: 'Telegram Stars' })).toHaveAttribute('aria-pressed', 'false');
  });
});
