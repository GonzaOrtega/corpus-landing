import { afterEach, describe, expect, it } from 'vitest';
import { FakeEmailSenderAdapter } from '../../adapters/email/fake-email-sender.adapter';
import { ResendEmailSenderAdapter } from '../../adapters/email/resend-email-sender.adapter';
import type { ServerConfig } from '../../config/server-env';
import { provideNotifications } from './notifications';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

/**
 * Vitest sets NODE_ENV=test, and Actions sets CI — both are pipeline signals,
 * so a case standing in for a developer machine has to clear them explicitly
 * rather than inherit the runner's own environment.
 */
const developerMachine = {
  ...ORIGINAL,
  NODE_ENV: 'development' as const,
  CI: undefined,
  E2E_NEON_HTTP_ENDPOINT: undefined,
  VERCEL_ENV: undefined,
};

const configured: ServerConfig = {
  siteUrl: new URL('http://localhost:3000'),
  releaseStage: 'early-access',
  downloadUrl: null,
  databaseUrl: 'postgres://example',
  databaseUrlUnpooled: 'postgres://example',
  recaptchaSiteKey: null,
  recaptchaApiKey: null,
  recaptchaProjectId: null,
  recaptchaScoreThreshold: 0.5,
  resendApiKey: 're_test_key',
  emailFrom: 'Corpus <hello@example.com>',
  replyTo: 'Corpus <hello@example.com>',
  emailPostalAddress: 'Corpus, 1 Example St',
  cronSecret: null,
  launchDryRunRecipient: null,
  managementTokenSecret: null,
};

describe('provideNotifications', () => {
  // The condition that matters most: compose bind-mounts the repo and
  // playwright.config.ts calls loadEnvConfig, so a real RESEND_API_KEY is
  // readable inside the E2E container. Credentials being present must not be
  // enough to send.
  describe('never sends from the pipeline, even fully configured', () => {
    it.each([
      ['CI', { CI: 'true' }],
      ['NODE_ENV=test', { NODE_ENV: 'test' as const }],
      ['E2E_NEON_HTTP_ENDPOINT', { E2E_NEON_HTTP_ENDPOINT: 'http://proxy:4444/sql' }],
    ])('uses the fake sender when %s is set', (_label, env) => {
      process.env = { ...developerMachine, ...env };

      const { emailSender } = provideNotifications(configured);

      expect(emailSender).toBeInstanceOf(FakeEmailSenderAdapter);
    });
  });

  it('sends from a developer machine when email is configured', () => {
    process.env = { ...developerMachine };

    const { emailSender } = provideNotifications(configured);

    expect(emailSender).toBeInstanceOf(ResendEmailSenderAdapter);
  });

  it('sends from Preview when that environment supplies its own sender', () => {
    process.env = { ...developerMachine, VERCEL_ENV: 'preview' };

    const { emailSender } = provideNotifications(configured);

    expect(emailSender).toBeInstanceOf(ResendEmailSenderAdapter);
  });

  it.each(['resendApiKey', 'emailFrom', 'replyTo', 'emailPostalAddress'] as const)(
    'falls back to the fake when %s is absent',
    (field) => {
      process.env = { ...developerMachine };

      const { emailSender } = provideNotifications({ ...configured, [field]: null });

      expect(emailSender).toBeInstanceOf(FakeEmailSenderAdapter);
    },
  );

  describe('Production', () => {
    it('fails closed rather than degrading to a fake', () => {
      process.env = { ...developerMachine, VERCEL_ENV: 'production' };

      expect(() => provideNotifications({ ...configured, resendApiKey: null })).toThrow(
        'Email delivery configuration is required in production',
      );
    });

    // Vercel sets CI during builds; Production is resolved before the pipeline
    // check so that can never silently downgrade a live deployment.
    it('sends even when a pipeline signal is present', () => {
      process.env = { ...developerMachine, VERCEL_ENV: 'production', CI: 'true' };

      const { emailSender } = provideNotifications(configured);

      expect(emailSender).toBeInstanceOf(ResendEmailSenderAdapter);
    });
  });
});
