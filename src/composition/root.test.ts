import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeCaptchaAdapter } from '../adapters/captcha/fake-captcha.adapter';
import { DrizzleEarlyAccessSignupRepository } from '../adapters/db/drizzle-early-access-signup.repository';
import { FakeEmailSenderAdapter } from '../adapters/email/fake-email-sender.adapter';
import { buildContext } from './root';

const baseEnv = {
  SITE_URL: 'https://corpus.example',
  CORPUS_RELEASE_STAGE: 'early-access',
  DATABASE_URL: 'postgres://user:pass@host.example/db',
  DATABASE_URL_UNPOOLED: 'postgres://user:pass@host.example/db',
};

function stubEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries({ ...baseEnv, ...overrides })) vi.stubEnv(key, value);
}

describe('buildContext', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('merges every capability into one context on a test host that opts into the fake CAPTCHA', () => {
    stubEnv({ VERCEL_ENV: undefined, CORPUS_FAKE_CAPTCHA: '1' });

    const context = buildContext();

    expect(context.serverConfig.siteUrl.href).toBe('https://corpus.example/');
    expect(context.earlyAccessSignupRepository).toBeInstanceOf(DrizzleEarlyAccessSignupRepository);
    expect(context.captchaVerifier).toBeInstanceOf(FakeCaptchaAdapter);
    // NODE_ENV=test is a pipeline signal, so notifications never reach a provider here.
    expect(context.emailSender).toBeInstanceOf(FakeEmailSenderAdapter);
    expect(typeof context.tokenGenerator.generate).toBe('function');
    expect(typeof context.tokenHasher.hash).toBe('function');
    expect(typeof context.logger.info).toBe('function');
  });

  it('selects the fake CAPTCHA on a Vercel preview without the explicit opt-in', () => {
    stubEnv({ VERCEL_ENV: 'preview', CORPUS_FAKE_CAPTCHA: undefined });

    expect(buildContext().captchaVerifier).toBeInstanceOf(FakeCaptchaAdapter);
  });
});
