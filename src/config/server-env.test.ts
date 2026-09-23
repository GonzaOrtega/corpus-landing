import { describe, expect, it } from 'vitest';
import { loadPublicConfig, productionRecaptchaSiteKey } from './public-env';
import { isSignupOpen, parseReleaseStage } from './release-stage';
import { loadServerConfig, loadSiteConfig } from './server-env';

/**
 * A minimal valid raw env — every field loadServerConfig requires when the
 * release stage is early-access. Tests mutate a copy of this rather than
 * building the full object inline each time.
 */
function validEarlyAccessEnv(): Record<string, string> {
  return {
    SITE_URL: 'https://corpus-landing.example',
    CORPUS_RELEASE_STAGE: 'early-access',
    DATABASE_URL: 'postgres://user:pass@host/db',
    DATABASE_URL_UNPOOLED: 'postgres://user:pass@host/db',
  };
}

describe('parseReleaseStage', () => {
  it('accepts early-access', () => {
    expect(parseReleaseStage('early-access')).toBe('early-access');
  });

  it('accepts launched', () => {
    expect(parseReleaseStage('launched')).toBe('launched');
  });

  it('rejects an unknown stage', () => {
    expect(() => parseReleaseStage('beta')).toThrow();
  });
});

describe('isSignupOpen', () => {
  it('is open during early-access', () => {
    expect(isSignupOpen('early-access')).toBe(true);
  });

  it('is closed once launched', () => {
    expect(isSignupOpen('launched')).toBe(false);
  });
});

describe('loadServerConfig', () => {
  it('throws when required variables are missing entirely', () => {
    expect(() =>
      loadServerConfig({ CORPUS_RELEASE_STAGE: 'launched', CORPUS_DOWNLOAD_URL: '' }),
    ).toThrow();
  });

  it('throws when launched with an empty download URL', () => {
    const env = {
      ...validEarlyAccessEnv(),
      CORPUS_RELEASE_STAGE: 'launched',
      CORPUS_DOWNLOAD_URL: '',
    };
    expect(() => loadServerConfig(env)).toThrow();
  });

  it('throws when launched with a non-HTTPS download URL', () => {
    const env = {
      ...validEarlyAccessEnv(),
      CORPUS_RELEASE_STAGE: 'launched',
      CORPUS_DOWNLOAD_URL: 'http://insecure.example/download',
    };
    expect(() => loadServerConfig(env)).toThrow();
  });

  it('loads successfully when launched with a valid HTTPS download URL', () => {
    const env = {
      ...validEarlyAccessEnv(),
      CORPUS_RELEASE_STAGE: 'launched',
      CORPUS_DOWNLOAD_URL: 'https://corpus-landing.example/download',
    };
    const config = loadServerConfig(env);
    expect(config.releaseStage).toBe('launched');
    expect(config.downloadUrl?.href).toBe('https://corpus-landing.example/download');
  });

  it('leaves downloadUrl null during early-access, regardless of what is set', () => {
    const config = loadServerConfig(validEarlyAccessEnv());
    expect(config.downloadUrl).toBeNull();
  });

  it('parses siteUrl as a URL and required strings as-is', () => {
    const config = loadServerConfig(validEarlyAccessEnv());
    expect(config.siteUrl.href).toBe('https://corpus-landing.example/');
    expect(config.databaseUrl).toBe('postgres://user:pass@host/db');
    expect(config.databaseUrlUnpooled).toBe('postgres://user:pass@host/db');
  });

  it('loads reCAPTCHA assessment configuration as server-only values', () => {
    const config = loadServerConfig({
      ...validEarlyAccessEnv(),
      RECAPTCHA_SITE_KEY: 'site-key-value',
      RECAPTCHA_API_KEY: 'api-key-value',
      RECAPTCHA_PROJECT_ID: 'corpus-project',
    });

    expect(config.recaptchaSiteKey).toBe('site-key-value');
    expect(config.recaptchaApiKey).toBe('api-key-value');
    expect(config.recaptchaProjectId).toBe('corpus-project');
  });

  it('defaults recaptchaScoreThreshold to 0.5 when unset', () => {
    const config = loadServerConfig(validEarlyAccessEnv());
    expect(config.recaptchaScoreThreshold).toBe(0.5);
  });

  it('defaults recaptchaScoreThreshold to 0.5 when set to an empty string, not 0', () => {
    // Number('') is 0 in JS. Coercing an unset-but-present env var straight to 0
    // would silently disable CAPTCHA scoring (every request passes) instead of
    // falling back to the documented default.
    const env = { ...validEarlyAccessEnv(), RECAPTCHA_SCORE_THRESHOLD: '' };
    expect(loadServerConfig(env).recaptchaScoreThreshold).toBe(0.5);
  });

  it('rejects a recaptchaScoreThreshold outside 0..1', () => {
    const env = { ...validEarlyAccessEnv(), RECAPTCHA_SCORE_THRESHOLD: '1.5' };
    expect(() => loadServerConfig(env)).toThrow();
  });

  it('resolves unset optional secrets to null, not undefined or empty string', () => {
    const config = loadServerConfig(validEarlyAccessEnv());
    expect(config.recaptchaSiteKey).toBeNull();
    expect(config.recaptchaApiKey).toBeNull();
    expect(config.recaptchaProjectId).toBeNull();
    expect(config.resendApiKey).toBeNull();
    expect(config.emailFrom).toBeNull();
    expect(config.replyTo).toBeNull();
    expect(config.emailPostalAddress).toBeNull();
    expect(config.cronSecret).toBeNull();
    expect(config.launchDryRunRecipient).toBeNull();
  });
});

describe('loadSiteConfig', () => {
  it('uses safe presentation defaults during local development', () => {
    const config = loadSiteConfig({ NODE_ENV: 'development', PORT: '3018' });

    expect(config.siteUrl.href).toBe('http://localhost:3018/');
    expect(config.releaseStage).toBe('early-access');
    expect(config.downloadUrl).toBeNull();
    expect(config.replyTo).toBeNull();
    expect(config.emailPostalAddress).toBeNull();
  });

  it('uses a Vercel deployment origin when SITE_URL is absent in production', () => {
    const config = loadSiteConfig({
      NODE_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'corpus.example',
    });

    expect(config.siteUrl.href).toBe('https://corpus.example/');
    expect(config.releaseStage).toBe('early-access');
  });

  // VERCEL_PROJECT_PRODUCTION_URL is set in every environment. Preferring it on
  // a preview made each deployment advertise the production origin as its
  // canonical, and hand out management links pointing at production.
  it('is canonical for itself on a preview deployment', () => {
    const config = loadSiteConfig({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'corpus-landing-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'corpus.example',
    });

    expect(config.siteUrl.href).toBe('https://corpus-landing-abc123.vercel.app/');
  });

  it('keeps the stable production origin on a production deployment', () => {
    const config = loadSiteConfig({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      VERCEL_URL: 'corpus-landing-xyz789.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'corpus.example',
    });

    expect(config.siteUrl.href).toBe('https://corpus.example/');
  });

  it('still lets an explicit SITE_URL win on a preview', () => {
    const config = loadSiteConfig({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      SITE_URL: 'https://staging.corpus.example',
      VERCEL_URL: 'corpus-landing-abc123.vercel.app',
    });

    expect(config.siteUrl.href).toBe('https://staging.corpus.example/');
  });

  it('does not make database configuration optional', () => {
    expect(() => loadServerConfig({ NODE_ENV: 'development' })).toThrow();
  });
});

describe('loadPublicConfig', () => {
  it('exposes only the reCAPTCHA site key, never server credentials', () => {
    // A realistic full server env, not just the one field loadPublicConfig's
    // narrowed parameter type declares — proving the extra credentials are
    // ignored even though they're present, not merely absent from the call.
    const fullEnv: Record<string, string | undefined> = {
      RECAPTCHA_SITE_KEY: 'site-key-value',
      RECAPTCHA_API_KEY: 'must-never-appear-here',
      RECAPTCHA_PROJECT_ID: 'must-never-appear-here',
      RESEND_API_KEY: 'must-never-appear-here',
    };
    const config = loadPublicConfig(fullEnv);
    expect(config).toEqual({ recaptchaSiteKey: 'site-key-value' });
  });

  it('is null when the site key is unset', () => {
    expect(loadPublicConfig({})).toEqual({ recaptchaSiteKey: null });
  });

  it('only passes the reCAPTCHA site key to a production deployment', () => {
    const config = loadPublicConfig({ RECAPTCHA_SITE_KEY: 'public-site-key' });

    expect(productionRecaptchaSiteKey('production', config)).toBe('public-site-key');
    expect(productionRecaptchaSiteKey('preview', config)).toBeNull();
    expect(productionRecaptchaSiteKey(undefined, config)).toBeNull();
  });
});
