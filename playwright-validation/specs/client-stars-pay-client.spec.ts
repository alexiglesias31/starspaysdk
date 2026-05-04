/**
 * StarsPayClient journey (13). Browser-driven via the harness app.
 */
import { test, expect } from '@playwright/test';

test.describe('StarsPayClient (browser)', () => {
  test('journey 13a: instantiating with sp_live_* throws', async ({ page }) => {
    test.info().annotations.push({ type: 'journey', description: '13a — server key in browser throws' });
    await page.goto('/client-direct');
    await page.getByTestId('run-bad-key').click();
    await expect(page.getByTestId('error')).toContainText('publishable');
  });

  test('journey 13b: isActive returns boolean', async ({ page }) => {
    test.info().annotations.push({ type: 'journey', description: '13b — isActive returns boolean' });
    await page.addInitScript(() => { (window as any).__paywallActive = true; });
    await page.goto('/client-direct');
    await page.getByTestId('run-active-check').click();
    await expect(page.getByTestId('active')).toHaveText('true');
  });
});
