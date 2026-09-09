import { FakeCaptchaAdapter } from '../../adapters/captcha/fake-captcha.adapter';
import { GoogleRecaptchaAdapter } from '../../adapters/captcha/google-recaptcha.adapter';
import type { ServerConfig } from '../../config/server-env';
import type { CaptchaVerifier } from '../../core/ports/captcha-verifier.port';

/**
 * Adapters for the external-api capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export interface ExternalApiDeps {
  captchaVerifier: CaptchaVerifier;
}

export const provideExternalApi = (config: ServerConfig): ExternalApiDeps => {
  if (process.env.VERCEL_ENV !== 'production') {
    return { captchaVerifier: new FakeCaptchaAdapter() };
  }
  if (!config.recaptchaSiteKey) {
    throw new Error('RECAPTCHA_SITE_KEY is required in production');
  }
  if (!config.recaptchaApiKey) {
    throw new Error('RECAPTCHA_API_KEY is required in production');
  }
  if (!config.recaptchaProjectId) {
    throw new Error('RECAPTCHA_PROJECT_ID is required in production');
  }
  return {
    captchaVerifier: new GoogleRecaptchaAdapter(
      config.recaptchaApiKey,
      config.recaptchaProjectId,
      config.recaptchaSiteKey,
      config.recaptchaScoreThreshold,
      config.siteUrl.hostname,
    ),
  };
};
