import { defineConfig } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.live' });
dotenvConfig({ path: '.env', override: false });

const isLive = process.env.STARSPAY_LIVE === '1';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env.HARNESS_BASE_URL || 'http://127.0.0.1:5179',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: [
    {
      command: './node_modules/.bin/tsx harness/server.ts',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      env: {
        ...(isLive ? { STARSPAY_LIVE: '1' } : {}),
      },
    },
    {
      command: './node_modules/.bin/vite --config harness/app/vite.config.ts --port 5179 --strictPort',
      port: 5179,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
