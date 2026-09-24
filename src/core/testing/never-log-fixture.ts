/**
 * Spec §24's never-log list, given realistic (placeholder) sample values.
 * Shared by every test that must prove a boundary drops them —
 * `pino-logger.adapter.test.ts` and `sentry-options.test.ts` (spec decision
 * 2 of `docs/superpowers/specs/2026-09-19-sentry-observability-design.md`).
 * One source of truth keeps their sample values, and field spelling, from
 * drifting apart again. `emailNormalized` matches the spelling used
 * everywhere else in the codebase (`early-access-signup.ts`,
 * `signup.schema.ts`, the Drizzle schema); nothing here is a real value.
 *
 * `emailWithApostrophe` is the shape a redaction rule is most likely to miss
 * and the signup form most likely to accept — Zod's `.email()` admits an
 * apostrophe in the local part, so `O'…` surnames reach the database and the
 * error text that quotes them back (R-26).
 */
export const NEVER_LOG_FIXTURE = {
  email: 'person@example.com',
  emailNormalized: 'person@example.com',
  emailWithApostrophe: "firstname.o'lastname@example.com",
  rawToken: 'raw-management-token-0123456789',
  manageTokenHash: 'sha256-hash-of-the-token',
  captchaToken: 'captcha-token-value',
  captchaScore: 0.3,
  providerResponseBody: '{"id":"resend-response-body"}',
  databaseUrl: 'postgres://user:pass@host/db',
  secret: 'super-secret-value',
  formData: { email: 'person@example.com' },
} as const;

/** Every scalar leaf of a value, as a string, depth first. */
const leaves = (value: unknown): string[] =>
  value instanceof Object ? Object.values(value).flatMap(leaves) : [String(value)];

/**
 * Every scalar value above, flattened and de-duplicated, for a
 * `.not.toContain` sweep. Derived rather than listed (R-38): a field added to
 * the fixture is swept by every suite with no second edit to forget.
 */
export const NEVER_LOG_FIXTURE_STRINGS: readonly string[] = [...new Set(leaves(NEVER_LOG_FIXTURE))];
