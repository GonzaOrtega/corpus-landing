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
    vi.stubEnv('CORPUS_FAKE_CAPTCHA', undefined);

    const deps = provideExternalApi(loadServerConfig(baseEnv));

    expect(deps.captchaVerifier).toBeInstanceOf(GoogleRecaptchaAdapter);
  });

  it.each([
    ['RECAPTCHA_SITE_KEY', 'RECAPTCHA_SITE_KEY is required in production'],
    ['RECAPTCHA_API_KEY', 'RECAPTCHA_API_KEY is required in production'],
    ['RECAPTCHA_PROJECT_ID', 'RECAPTCHA_PROJECT_ID is required in production'],
  ])('fails closed when %s is missing in Production', (name, message) => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('CORPUS_FAKE_CAPTCHA', undefined);
    const env = { ...baseEnv };
    delete env[name];

    expect(() => provideExternalApi(loadServerConfig(env))).toThrow(message);
  });

  // Absence of VERCEL_ENV means "not on Vercel", where no Deployment Protection
  // applies and the real Resend sender may be configured. Selecting the fake by
  // absence would make an unconfigured host an open mailer, so it must be asked
  // for. `''` counts as absent, matching the server-env blank-is-unset idiom.
  it.each([undefined, ''])(
    'fails closed off Vercel when the fake is not requested (VERCEL_ENV=%o)',
    (deploymentEnvironment) => {
      vi.stubEnv('VERCEL_ENV', deploymentEnvironment);
      vi.stubEnv('CORPUS_FAKE_CAPTCHA', undefined);

      expect(() => provideExternalApi(loadServerConfig(baseEnv))).toThrow(
        'CORPUS_FAKE_CAPTCHA=1 is required',
      );
    },
  );

  it('selects the fake off Vercel only when explicitly requested', () => {
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('CORPUS_FAKE_CAPTCHA', '1');

    const deps = provideExternalApi(loadServerConfig(baseEnv));

    expect(deps.captchaVerifier).toBeInstanceOf(FakeCaptchaAdapter);
  });

  // Preview and CI are spec-mandated fake environments (§8, §34), so they must
  // keep working without the flag — no new Vercel configuration to forget.
  it.each(['preview', 'development'])(
    'needs no opt-in on Vercel %s, which the spec requires to stay fake',
    (deploymentEnvironment) => {
      vi.stubEnv('VERCEL_ENV', deploymentEnvironment);
      vi.stubEnv('CORPUS_FAKE_CAPTCHA', undefined);

      const deps = provideExternalApi(loadServerConfig(baseEnv));

      expect(deps.captchaVerifier).toBeInstanceOf(FakeCaptchaAdapter);
    },
  );

  // Any value, including one too malformed to opt in anywhere else: Production
  // silently ignoring a misspelled flag would look identical to honouring it.
  it.each(['1', 'true', '0'])(
    'refuses to start when the fake flag is present in Production (=%s)',
    (flag) => {
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('CORPUS_FAKE_CAPTCHA', flag);

      expect(() => provideExternalApi(loadServerConfig(baseEnv))).toThrow(
        'CORPUS_FAKE_CAPTCHA must never be set in Production',
      );
    },
  );
});
