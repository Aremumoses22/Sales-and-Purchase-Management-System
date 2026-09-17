import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the main flows (PLAN.md §8). They run against a running app (`pnpm dev`)
 * signed in as the seeded admin, and create their own uniquely named data each run.
 */
export default defineConfig({
  testDir: './tests',
  // The flows share one database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
