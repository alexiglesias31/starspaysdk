/**
 * PaywallGate journey (14).
 *
 * Exercises the React component through the Vite app. The app stubs
 * window.fetch so we can flip the active flag from the spec.
 */
import { test, expect } from '@playwright/test';

test.describe('<PaywallGate />', () => {
  test('journey 14a: renders fallback when isActive=false', async ({ page }) => {
    test.info().annotations.push({ type: 'journey', description: '14a — paywall fallback when inactive' });
    await page.addInitScript(() => { (window as any).__paywallActive = false; });
    await page.goto('/paywall');
    await expect(page.getByTestId('paywall-fallback')).toBeVisible();
    await expect(page.getByTestId('paywall-children')).toHaveCount(0);
  });

  test('journey 14b: renders children when isActive=true', async ({ page }) => {
    test.info().annotations.push({ type: 'journey', description: '14b — paywall lets active users through' });
    await page.addInitScript(() => {
      (window as any).__paywallActive = true;
      (window as any).__paywallSubscription = {
        id: 'sub_1', app_id: 'app', customer_id: 'c', telegram_user_id: 7777777,
        product_id: 'p', price_id: 'pr', status: 'active', amount: 100,
        telegram_payment_charge_id: 'ch', provider_payment_charge_id: null,
        invoice_payload: 'pl', current_period_start: 0,
        current_period_end: Math.floor(Date.now() / 1000) + 2_592_000,
        cancel_at_period_end: false, canceled_at: null,
        grace_period_seconds: 259200,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
    });
    await page.goto('/paywall');
    await expect(page.getByTestId('paywall-children')).toBeVisible();
  });
});
