import { afterEach, describe, expect, it } from 'vitest';
import { getMaintenanceOperation } from './maintenance.wiring';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('maintenance operation construction', () => {
  /**
   * The route authorises before it runs, but it used to build the whole
   * context first. In production that constructs the real CAPTCHA adapter,
   * which throws when its credential is absent — so an anonymous request got
   * a 500 telling it the deployment was misconfigured, instead of a 401.
   * Construction must stay inside execute.
   */
  it('exposes the cron secret without constructing production-only adapters', () => {
    process.env = {
      ...ORIGINAL,
      VERCEL_ENV: 'production',
      SITE_URL: 'https://corpus.example',
      DATABASE_URL: 'postgres://example/db',
      DATABASE_URL_UNPOOLED: 'postgres://example/db',
      CRON_SECRET: 'cron-secret-value',
      RECAPTCHA_SECRET_KEY: undefined,
    };

    const operation = getMaintenanceOperation();

    expect(operation.cronSecret).toBe('cron-secret-value');
    expect(typeof operation.execute).toBe('function');
  });

  it('still refuses to run the operation itself without that credential', async () => {
    process.env = {
      ...ORIGINAL,
      VERCEL_ENV: 'production',
      SITE_URL: 'https://corpus.example',
      DATABASE_URL: 'postgres://example/db',
      DATABASE_URL_UNPOOLED: 'postgres://example/db',
      CRON_SECRET: 'cron-secret-value',
      RECAPTCHA_SECRET_KEY: undefined,
    };

    const operation = getMaintenanceOperation();

    // Deferring construction must not swallow the misconfiguration — an
    // authorised caller still gets the loud failure. buildContext validates
    // persistence before the CAPTCHA adapter, so the exact message depends on
    // which credential is missing first; that it throws at all is the contract.
    await expect(operation.execute()).rejects.toThrow();
  });
});
