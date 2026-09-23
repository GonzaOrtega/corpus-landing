import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { NoopErrorReporterAdapter } from '../../adapters/observability/noop-error-reporter.adapter';
import { SentryErrorReporterAdapter } from '../../adapters/observability/sentry-error-reporter.adapter';
import { provideObservability } from './observability';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

/** See notifications.test.ts: Vitest sets NODE_ENV=test and Actions sets CI. */
const developerMachine = {
  ...ORIGINAL,
  NODE_ENV: 'development' as const,
  CI: undefined,
  E2E_NEON_HTTP_ENDPOINT: undefined,
  VERCEL_ENV: undefined,
};

const DSN = 'https://public@o1.ingest.sentry.io/1';

describe('provideObservability', () => {
  describe('never reports from the pipeline, even with a DSN', () => {
    it.each([
      ['CI', { CI: 'true' }],
      ['NODE_ENV=test', { NODE_ENV: 'test' as const }],
      ['E2E_NEON_HTTP_ENDPOINT', { E2E_NEON_HTTP_ENDPOINT: 'http://proxy:4444/sql' }],
    ])('selects the no-op reporter when %s is set', (_label, env) => {
      process.env = { ...developerMachine, ...env, NEXT_PUBLIC_SENTRY_DSN: DSN };

      expect(provideObservability().errorReporter).toBeInstanceOf(NoopErrorReporterAdapter);
    });
  });

  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['the Vercel sensitive placeholder', '[SENSITIVE]'],
  ])('selects the no-op reporter when the DSN is %s', (_label, dsn) => {
    process.env = { ...developerMachine, NEXT_PUBLIC_SENTRY_DSN: dsn };

    expect(provideObservability().errorReporter).toBeInstanceOf(NoopErrorReporterAdapter);
  });

  it('selects the Sentry reporter on a deployment with a DSN', () => {
    process.env = { ...developerMachine, VERCEL_ENV: 'production', NEXT_PUBLIC_SENTRY_DSN: DSN };

    expect(provideObservability().errorReporter).toBeInstanceOf(SentryErrorReporterAdapter);
  });

  /**
   * R-11: the choice must follow the SDK's own runtime rule. Next.js inlines
   * the literal `process.env.NEXT_PUBLIC_SENTRY_DSN` at build time, so a
   * provider that read it could disagree with the SDK in a deployed build.
   * Vitest does not inline anything, so no runtime assertion can see that;
   * the source is checked instead.
   */
  it('never reads the build-time-inlined DSN literal', () => {
    const source = readFileSync(new URL('./observability.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_SENTRY_DSN/);
    expect(source).toMatch(/buildServerSentryOptions\(process\.env\)/);
  });

  it('never throws, so a boundary can always obtain a reporter before wiring', () => {
    process.env = { ...developerMachine, DATABASE_URL: undefined };

    expect(() => provideObservability()).not.toThrow();
  });
});
