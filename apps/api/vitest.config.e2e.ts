import 'dotenv/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // The app under test talks to the dedicated test database, never the dev one.
    env: { DATABASE_URL: process.env['TEST_DATABASE_URL'] ?? '' },
    globalSetup: ['test/global-setup.ts'],
    // All e2e files share one test database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
