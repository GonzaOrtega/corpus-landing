import 'server-only';
import { z } from 'zod';
import { parseReleaseStage, type ReleaseStage } from './release-stage';

/**
 * Full server-side runtime configuration (spec §35). Contains secrets —
 * never pass this to anything that renders on the client. `loadPublicConfig`
 * is the deliberately narrow subset that may cross that boundary.
 */
export interface ServerConfig {
  siteUrl: URL;
  releaseStage: ReleaseStage;
  downloadUrl: URL | null;
  databaseUrl: string;
  databaseUrlUnpooled: string;
  recaptchaSecretKey: string | null;
  recaptchaScoreThreshold: number;
  resendApiKey: string | null;
  emailFrom: string | null;
  replyTo: string | null;
  emailPostalAddress: string | null;
  cronSecret: string | null;
  launchDryRunRecipient: string | null;
}

/** Blank and unset both mean "not configured" for these — never bare `''`. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.length === 0 ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().optional()).transform((v) => v ?? null);

const rawServerEnvSchema = z.object({
  SITE_URL: z.string().url(),
  CORPUS_RELEASE_STAGE: z.string(),
  CORPUS_DOWNLOAD_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1),
  RECAPTCHA_SECRET_KEY: optionalString(),
  // Number('') is 0 — preprocessing blank-to-undefined keeps an unset or
  // blank threshold on the documented default instead of silently disabling
  // CAPTCHA scoring.
  RECAPTCHA_SCORE_THRESHOLD: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0).max(1).default(0.5),
  ),
  RESEND_API_KEY: optionalString(),
  EMAIL_FROM: optionalString(),
  REPLY_TO: optionalString(),
  EMAIL_POSTAL_ADDRESS: optionalString(),
  CRON_SECRET: optionalString(),
  LAUNCH_DRY_RUN_RECIPIENT: optionalString(),
});

export function loadServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const raw = rawServerEnvSchema.parse(env);
  const releaseStage = parseReleaseStage(raw.CORPUS_RELEASE_STAGE);

  // §3.2: CORPUS_DOWNLOAD_URL only means anything once launched. Early-access
  // ignores whatever is set — the CTA that would use it isn't rendered yet.
  let downloadUrl: URL | null = null;
  if (releaseStage === 'launched') {
    if (!raw.CORPUS_DOWNLOAD_URL) {
      throw new Error('CORPUS_DOWNLOAD_URL is required when CORPUS_RELEASE_STAGE=launched');
    }
    const parsed = new URL(raw.CORPUS_DOWNLOAD_URL);
    if (parsed.protocol !== 'https:') {
      throw new Error(`CORPUS_DOWNLOAD_URL must be HTTPS when launched, got "${parsed.protocol}"`);
    }
    downloadUrl = parsed;
  }

  return {
    siteUrl: new URL(raw.SITE_URL),
    releaseStage,
    downloadUrl,
    databaseUrl: raw.DATABASE_URL,
    databaseUrlUnpooled: raw.DATABASE_URL_UNPOOLED,
    recaptchaSecretKey: raw.RECAPTCHA_SECRET_KEY,
    recaptchaScoreThreshold: raw.RECAPTCHA_SCORE_THRESHOLD,
    resendApiKey: raw.RESEND_API_KEY,
    emailFrom: raw.EMAIL_FROM,
    replyTo: raw.REPLY_TO,
    emailPostalAddress: raw.EMAIL_POSTAL_ADDRESS,
    cronSecret: raw.CRON_SECRET,
    launchDryRunRecipient: raw.LAUNCH_DRY_RUN_RECIPIENT,
  };
}
