import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeCaptchaAdapter } from '../../adapters/captcha/fake-captcha.adapter';
import { GoogleRecaptchaAdapter } from '../../adapters/captcha/google-recaptcha.adapter';
import { loadServerConfig } from '../../config/server-env';
import { provideExternalApi } from './external-api';

vi.mock('server-only', () => ({}));

const baseEnv: Record<string, string> = {
  SITE_URL: 'https://corpus.example',
  DATABASE_URL: 'postgres://user:pass@host/db',
  DATABASE_URL_UNPOOLED: 'postgres://user:pass@host/db',
  RECAPTCHA_SITE_KEY: 'site-key',
  RECAPTCHA_API_KEY: 'api-key',
  RECAPTCHA_PROJECT_ID: 'corpus-project',
};

afterEach(() => vi.unstubAllEnvs());

describe('provideExternalApi', () => {
  it('keeps the deterministic fake CAPTCHA outside Production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    const deps = provideExternalApi(loadServerConfig(baseEnv));

    expect(deps.captchaVerifier).toBeInstanceOf(FakeCaptchaAdapter);
  });

  it('constructs the assessment-backed Google adapter in Production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    const deps = provideExternalApi(loadServerConfig(baseEnv));

    expect(deps.captchaVerifier).toBeInstanceOf(GoogleRecaptchaAdapter);
  });

  it.each([
    ['RECAPTCHA_SITE_KEY', 'RECAPTCHA_SITE_KEY is required in production'],
    ['RECAPTCHA_API_KEY', 'RECAPTCHA_API_KEY is required in production'],
    ['RECAPTCHA_PROJECT_ID', 'RECAPTCHA_PROJECT_ID is required in production'],
  ])('fails closed when %s is missing in Production', (name, message) => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const env = { ...baseEnv };
    delete env[name];

    expect(() => provideExternalApi(loadServerConfig(env))).toThrow(message);
  });
});
