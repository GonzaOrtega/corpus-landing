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
  recaptchaSiteKey: string | null;
  recaptchaApiKey: string | null;
  recaptchaProjectId: string | null;
  recaptchaScoreThreshold: number;
  resendApiKey: string | null;
  emailFrom: string | null;
  replyTo: string | null;
  emailPostalAddress: string | null;
  cronSecret: string | null;
  launchDryRunRecipient: string | null;
  managementTokenSecret: string | null;
}

/** Non-secret configuration needed to render pages and discovery metadata. */
export type SiteConfig = Pick<
  ServerConfig,
  'siteUrl' | 'releaseStage' | 'downloadUrl' | 'replyTo' | 'emailPostalAddress'
>;

/** Blank and unset both mean "not configured" for these — never bare `''`. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.length === 0 ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().optional()).transform((v) => v ?? null);

const rawSiteEnvSchema = z.object({
  SITE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  CORPUS_RELEASE_STAGE: z.preprocess(emptyToUndefined, z.string().optional()),
  CORPUS_DOWNLOAD_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  VERCEL_PROJECT_PRODUCTION_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  VERCEL_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65_535).optional()),
  REPLY_TO: optionalString(),
  EMAIL_POSTAL_ADDRESS: optionalString(),
});

const rawServerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1),
  RECAPTCHA_SITE_KEY: optionalString(),
  RECAPTCHA_API_KEY: optionalString(),
  RECAPTCHA_PROJECT_ID: optionalString(),
  // Number('') is 0 — preprocessing blank-to-undefined keeps an unset or
  // blank threshold on the documented default instead of silently disabling
  // CAPTCHA scoring.
  RECAPTCHA_SCORE_THRESHOLD: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0).max(1).default(0.5),
  ),
  RESEND_API_KEY: optionalString(),
  EMAIL_FROM: optionalString(),
  CRON_SECRET: optionalString(),
  LAUNCH_DRY_RUN_RECIPIENT: optionalString(),
  MANAGEMENT_TOKEN_SECRET: optionalString(),
});

export function loadSiteConfig(env: Record<string, string | undefined>): SiteConfig {
  const raw = rawSiteEnvSchema.parse(env);
  const releaseStage = parseReleaseStage(raw.CORPUS_RELEASE_STAGE ?? 'early-access');
  // VERCEL_PROJECT_PRODUCTION_URL is exposed in every environment, so preferring
  // it unconditionally made previews claim the production origin — canonical
  // links and, worse, subscriber management links pointing at production. A
  // preview is canonical for itself. VERCEL_URL is a build-time variable, not
  // an incoming proxy header, so this stays within spec §21.
  const deploymentHostname =
    env.VERCEL_ENV === 'production'
      ? (raw.VERCEL_PROJECT_PRODUCTION_URL ?? raw.VERCEL_URL)
      : (raw.VERCEL_URL ?? raw.VERCEL_PROJECT_PRODUCTION_URL);
  const siteUrl = raw.SITE_URL
    ? new URL(raw.SITE_URL)
    : deploymentHostname
      ? new URL(`https://${deploymentHostname}`)
      : new URL(`http://localhost:${raw.PORT ?? 3000}`);

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
    siteUrl,
    releaseStage,
    downloadUrl,
    replyTo: raw.REPLY_TO,
    emailPostalAddress: raw.EMAIL_POSTAL_ADDRESS,
  };
}

export function loadServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const siteConfig = loadSiteConfig(env);
  const raw = rawServerEnvSchema.parse(env);

  return {
    ...siteConfig,
    databaseUrl: raw.DATABASE_URL,
    databaseUrlUnpooled: raw.DATABASE_URL_UNPOOLED,
    recaptchaSiteKey: raw.RECAPTCHA_SITE_KEY,
    recaptchaApiKey: raw.RECAPTCHA_API_KEY,
    recaptchaProjectId: raw.RECAPTCHA_PROJECT_ID,
    recaptchaScoreThreshold: raw.RECAPTCHA_SCORE_THRESHOLD,
    resendApiKey: raw.RESEND_API_KEY,
    emailFrom: raw.EMAIL_FROM,
    cronSecret: raw.CRON_SECRET,
    launchDryRunRecipient: raw.LAUNCH_DRY_RUN_RECIPIENT,
    managementTokenSecret: raw.MANAGEMENT_TOKEN_SECRET,
  };
}
