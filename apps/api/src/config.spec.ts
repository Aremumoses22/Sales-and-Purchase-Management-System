import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_ENV = { DATABASE_URL: 'postgresql://localhost/spms_test', JWT_SECRET: 'x'.repeat(64) };

async function loadConfig(env: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...env })) vi.stubEnv(key, value);
  return import('./config.js');
}

describe('production configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('turns API docs off in production unless asked for', async () => {
    expect((await loadConfig({ NODE_ENV: 'development' })).config.apiDocsEnabled).toBe(true);
    expect((await loadConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true' })).config.apiDocsEnabled).toBe(false);
    expect((await loadConfig({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' })).config.apiDocsEnabled).toBe(true);
  });

  it('refuses a weak secret or insecure cookies in production', async () => {
    const weak = await loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'change-me', COOKIE_SECURE: 'false' });
    expect(() => weak.assertProductionConfig()).toThrow(/JWT_SECRET[\s\S]*COOKIE_SECURE/);

    const safe = await loadConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true' });
    expect(() => safe.assertProductionConfig()).not.toThrow();

    const development = await loadConfig({ NODE_ENV: 'development', JWT_SECRET: 'change-me' });
    expect(() => development.assertProductionConfig()).not.toThrow();
  });
});
