import { beforeEach, describe, expect, it } from 'vitest';
import type { NewEarlyAccessSignup } from '../../core/entities/early-access-signup';
import { runEarlyAccessSignupRepositoryContract } from '../../core/testing/early-access-signup-repository.contract';
import { DrizzleEarlyAccessSignupRepository } from './drizzle-early-access-signup.repository';
import { createNeonDatabase } from './neon-database.adapter';
import { earlyAccessSignups } from './schema';

/**
 * Runs against a real Postgres database, never in-memory — proves the
 * partial unique index (§9.2) and Drizzle mapping actually work, not just
 * the in-memory mirror of them.
 *
 * Reads DATABASE_URL_TEST, deliberately never DATABASE_URL: the `beforeEach`
 * below unconditionally deletes every row, and DATABASE_URL is the variable
 * the setup guide tells a developer to point at the shared Neon
 * `development` branch — a variable Bun also auto-loads from `.env.local`
 * into every `bun run` script, `check` included. A separate, otherwise-idle
 * variable name means a developer's ordinary database is never in scope for
 * this delete no matter what runs `bun run check`/`test`/`test:coverage`;
 * only a connection someone explicitly assigned to DATABASE_URL_TEST is at
 * risk, which is opt-in by construction rather than by discipline.
 *
 * The CI `test` job hands its disposable per-run Neon branch over under this
 * name; to run the suite locally, follow docs/quality/testing.md
 * ("Measuring the Drizzle repository"). Without the variable the suite skips
 * rather than failing.
 */
const connectionString = process.env.DATABASE_URL_TEST;

if (connectionString) {
  describe('DrizzleEarlyAccessSignupRepository (integration)', () => {
    const db = createNeonDatabase(connectionString);

    beforeEach(async () => {
      await db.delete(earlyAccessSignups);
    });

    runEarlyAccessSignupRepositoryContract(
      'contract',
      () => new DrizzleEarlyAccessSignupRepository(db),
    );

    it('never leaks the plaintext email/query into a non-conflict database error', async () => {
      const repo = new DrizzleEarlyAccessSignupRepository(db);
      const secretEmail = 'leak-check@example.com';
      const invalidInput = {
        emailOriginal: secretEmail,
        emailNormalized: secretEmail,
        // A NOT NULL violation on consentVersion — not the unique-violation
        // path — proves every other driver error is sanitized before it
        // escapes, not just the one PersistenceConflictError special-cases.
        consentVersion: null as unknown as string,
        consentedAt: new Date(),
        manageTokenHash: 'hash-leak-check',
      } satisfies NewEarlyAccessSignup;

      await expect(repo.create(invalidInput)).rejects.toSatisfy((error: unknown) => {
        const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
        expect(serialized).not.toContain(secretEmail);
        expect(serialized).not.toContain('hash-leak-check');
        return true;
      });
    });
  });
} else {
  describe.skip('DrizzleEarlyAccessSignupRepository (integration) — no DATABASE_URL_TEST configured', () => {});
}
