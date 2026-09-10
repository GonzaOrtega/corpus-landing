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

/**
 * Opt-in for the deterministic fake, required only where `VERCEL_ENV` is absent.
 * Spec §8 and §34 make the fake binding for Preview, CI and local, so Vercel's
 * own `preview` and `development` environments keep selecting it with no extra
 * configuration and no change to how Preview is deployed.
 *
 * An absent `VERCEL_ENV` is a different situation: it means this is not running
 * on Vercel at all — a container, a plain `next start`, a self-hosted box — where
 * neither Deployment Protection nor `git.deploymentEnabled: false` applies, and
 * `provideNotifications` will pair the CAPTCHA-free form with the real Resend
 * sender whenever those variables are present. Selecting the fake by absence
 * therefore turns an unconfigured host into an open mailer on a verified domain.
 * Requiring the flag makes the safe branch the default instead.
 */
const FAKE_CAPTCHA_FLAG = 'CORPUS_FAKE_CAPTCHA';

export const provideExternalApi = (config: ServerConfig): ExternalApiDeps => {
  // Blank and unset both mean "not on Vercel", matching the server-env idiom.
  const deploymentEnvironment = process.env.VERCEL_ENV || undefined;
  const fakeCaptchaFlag = process.env[FAKE_CAPTCHA_FLAG];
  const fakeCaptchaRequested = fakeCaptchaFlag === '1';

  if (deploymentEnvironment !== 'production') {
    if (deploymentEnvironment === undefined && !fakeCaptchaRequested) {
      throw new Error(
        `${FAKE_CAPTCHA_FLAG}=1 is required to run without CAPTCHA verification off Vercel. ` +
          'Set it deliberately for local, container and CI runs; never on a deployment that accepts real signups.',
      );
    }
    return { captchaVerifier: new FakeCaptchaAdapter() };
  }
  // Any value, not just `1`: a misspelled opt-in that Production silently ignored
  // would be indistinguishable from one that worked, so refuse the whole variable.
  if (fakeCaptchaFlag) {
    throw new Error(`${FAKE_CAPTCHA_FLAG} must never be set in Production`);
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
