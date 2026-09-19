/**
 * Spec §24's never-log list, given realistic (placeholder) sample values.
 * Shared by every test that must prove a boundary drops them —
 * `pino-logger.adapter.test.ts` and `sentry-options.test.ts` (spec decision
 * 2 of `docs/superpowers/specs/2026-09-19-sentry-observability-design.md`).
 * One source of truth keeps their sample values, and field spelling, from
 * drifting apart again. `emailNormalized` matches the spelling used
 * everywhere else in the codebase (`early-access-signup.ts`,
 * `signup.schema.ts`, the Drizzle schema); nothing here is a real value.
 */
export const NEVER_LOG_FIXTURE = {
  email: 'person@example.com',
  emailNormalized: 'person@example.com',
  rawToken: 'raw-management-token-0123456789',
  manageTokenHash: 'sha256-hash-of-the-token',
  captchaToken: 'captcha-token-value',
  captchaScore: 0.3,
  providerResponseBody: '{"id":"resend-response-body"}',
  databaseUrl: 'postgres://user:pass@host/db',
  secret: 'super-secret-value',
  formData: { email: 'person@example.com' },
} as const;

/** Every scalar value above, flattened, for a `.not.toContain` sweep. */
export const NEVER_LOG_FIXTURE_STRINGS: readonly string[] = [
  NEVER_LOG_FIXTURE.email,
  NEVER_LOG_FIXTURE.rawToken,
  NEVER_LOG_FIXTURE.manageTokenHash,
  NEVER_LOG_FIXTURE.captchaToken,
  String(NEVER_LOG_FIXTURE.captchaScore),
  NEVER_LOG_FIXTURE.providerResponseBody,
  NEVER_LOG_FIXTURE.databaseUrl,
  NEVER_LOG_FIXTURE.secret,
];
