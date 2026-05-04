/**
 * SubscriptionButton journey (15).
 */
import { test, expect } from '@playwright/test';

test.describe('<SubscriptionButton />', () => {
  test('journey 15a: click → openInvoice resolves "paid" → onSuccess fires', async ({ page }) => {
    test.info().annotations.push({ type: 'journey', description: '15a — subscription button success path' });
    await page.addInitScript(() => { (window as any).__nextOpenInvoiceResult = 'paid'; });
    await page.goto('/subscription-button');
    await page.getByRole('button', { name: /Subscribe/ }).click();
    await expect(page.getByTestId('outcome')).toHaveText('success', { timeout: 5000 });
  });

  test('journey 15b: openInvoice cancelled does not fire onSuccess', async ({ page }) => {
    test.info().annotations.push({ type: 'journey', description: '15b — subscription button cancelled' });
    await page.addInitScript(() => { (window as any).__nextOpenInvoiceResult = 'cancelled'; });
    await page.goto('/subscription-button');
    await page.getByRole('button', { name: /Subscribe/ }).click();
    // outcome remains "idle" because cancelled is a no-op
    await page.waitForTimeout(500);
    await expect(page.getByTestId('outcome')).not.toHaveText('success');
  });
});
