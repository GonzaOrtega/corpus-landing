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
  if (!config.recaptchaSecretKey) {
    throw new Error('RECAPTCHA_SECRET_KEY is required in production');
  }
  return {
    captchaVerifier: new GoogleRecaptchaAdapter(
      config.recaptchaSecretKey,
      config.recaptchaScoreThreshold,
      config.siteUrl.hostname,
    ),
  };
};
