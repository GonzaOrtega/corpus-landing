import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup, type NewEarlyAccessSignup } from '../entities/early-access-signup';
import { PersistenceConflictError } from '../errors/early-access-errors';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';

function buildInput(overrides: Partial<NewEarlyAccessSignup> = {}): NewEarlyAccessSignup {
  return {
    emailOriginal: 'Person@Example.com',
    emailNormalized: 'person@example.com',
    consentVersion: '2026-09-01',
    consentedAt: new Date('2026-09-01T00:00:00Z'),
    manageTokenHash: 'hash-1',
    ...overrides,
  };
}

/**
 * §9.2's uniqueness invariant must hold identically for every
 * EarlyAccessSignupRepository implementation — this suite runs unchanged
 * against both the in-memory double and the real Drizzle adapter.
 */
export function runEarlyAccessSignupRepositoryContract(
  label: string,
  createRepository: () => EarlyAccessSignupRepository | Promise<EarlyAccessSignupRepository>,
): void {
  describe(label, () => {
    it('creates a new signup with pending lifecycle defaults', async () => {
      const repo = await createRepository();
      const signup = await repo.create(buildInput());
      const props = signup.toProps();
      expect(props.emailNormalized).toBe('person@example.com');
      expect(props.confirmationStatus).toBe('pending');
      expect(props.launchStatus).toBe('pending');
    });

    it('rejects a second active row for the same normalized email — §9.2', async () => {
      const repo = await createRepository();
      await repo.create(buildInput());
      await expect(repo.create(buildInput({ manageTokenHash: 'hash-2' }))).rejects.toThrow(
        PersistenceConflictError,
      );
    });

    it('permits a new row once the prior one is anonymized — §6.5', async () => {
      const repo = await createRepository();
      const original = await repo.create(buildInput());
      const anonymized = EarlyAccessSignup.fromProps({
        ...original.toProps(),
        emailOriginal: null,
        emailNormalized: null,
        manageTokenHash: null,
        anonymizedAt: new Date('2026-10-01T00:00:00Z'),
      });
      await repo.save(anonymized);

      const fresh = await repo.create(buildInput({ manageTokenHash: 'hash-3' }));
      expect(fresh.toProps().emailNormalized).toBe('person@example.com');
    });

    it('finds the current row by normalized email, ignoring anonymized ones', async () => {
      const repo = await createRepository();
      const created = await repo.create(buildInput());
      const found = await repo.findCurrentByNormalizedEmail('person@example.com');
      expect(found?.id).toBe(created.id);
    });

    it('does not find an anonymized row by normalized email', async () => {
      const repo = await createRepository();
      const original = await repo.create(buildInput());
      await repo.save(
        EarlyAccessSignup.fromProps({
          ...original.toProps(),
          emailOriginal: null,
          emailNormalized: null,
          manageTokenHash: null,
          anonymizedAt: new Date('2026-10-01T00:00:00Z'),
        }),
      );
      expect(await repo.findCurrentByNormalizedEmail('person@example.com')).toBeNull();
    });

    it('finds a row by its manage token hash', async () => {
      const repo = await createRepository();
      const created = await repo.create(buildInput({ manageTokenHash: 'token-hash-abc' }));
      const found = await repo.findByManageTokenHash('token-hash-abc');
      expect(found?.id).toBe(created.id);
    });

    it('excludes unsubscribed or anonymized rows from launch eligibility', async () => {
      const repo = await createRepository();
      const eligible = await repo.create(buildInput());
      const unsubscribed = await repo.create(
        buildInput({ emailNormalized: 'other@example.com', manageTokenHash: 'hash-other' }),
      );
      await repo.save(
        EarlyAccessSignup.fromProps({
          ...unsubscribed.toProps(),
          unsubscribedAt: new Date('2026-09-05T00:00:00Z'),
        }),
      );

      const result = await repo.findLaunchEligible(10);
      expect(result.map((row) => row.id)).toEqual([eligible.id]);
      expect(await repo.countLaunchEligible()).toBe(1);
    });

    it('pages launch-eligible rows strictly after a cursor in id order', async () => {
      const repo = await createRepository();
      const created = await Promise.all(
        ['a', 'b', 'c'].map((suffix) =>
          repo.create(
            buildInput({
              emailNormalized: `${suffix}@example.com`,
              manageTokenHash: `hash-${suffix}`,
            }),
          ),
        ),
      );
      const ordered = created.map((row) => row.id).sort((left, right) => left.localeCompare(right));

      const firstPage = await repo.findLaunchEligible(2);
      const secondPage = await repo.findLaunchEligible(2, firstPage[1]?.id);

      expect(firstPage.map((row) => row.id)).toEqual(ordered.slice(0, 2));
      expect(secondPage.map((row) => row.id)).toEqual(ordered.slice(2));
    });

    it('finds confirmations due for retry, ignoring ones not yet due', async () => {
      const repo = await createRepository();
      const due = await repo.create(buildInput());
      await repo.save(
        EarlyAccessSignup.fromProps({
          ...due.toProps(),
          confirmationStatus: 'failed',
          confirmationNextAttemptAt: new Date('2026-09-02T00:00:00Z'),
        }),
      );
      const notYetDue = await repo.create(
        buildInput({ emailNormalized: 'later@example.com', manageTokenHash: 'hash-later' }),
      );
      await repo.save(
        EarlyAccessSignup.fromProps({
          ...notYetDue.toProps(),
          confirmationStatus: 'failed',
          confirmationNextAttemptAt: new Date('2026-09-10T00:00:00Z'),
        }),
      );

      const result = await repo.findConfirmationsDue(new Date('2026-09-03T00:00:00Z'), 10);
      expect(result.map((row) => row.id)).toEqual([due.id]);
    });

    it('finds rows due for PII purge 30 days after launch or unsubscribe — §10.1/§10.2', async () => {
      const repo = await createRepository();
      const launched = await repo.create(buildInput());
      await repo.save(
        EarlyAccessSignup.fromProps({
          ...launched.toProps(),
          launchSentAt: new Date('2026-08-01T00:00:00Z'),
        }),
      );
      const recentlyUnsubscribed = await repo.create(
        buildInput({ emailNormalized: 'recent@example.com', manageTokenHash: 'hash-recent' }),
      );
      await repo.save(
        EarlyAccessSignup.fromProps({
          ...recentlyUnsubscribed.toProps(),
          unsubscribedAt: new Date('2026-09-05T00:00:00Z'),
        }),
      );

      const result = await repo.findPiiPurgeDue(new Date('2026-09-06T00:00:00Z'), 10);
      expect(result.map((row) => row.id)).toEqual([launched.id]);
    });
  });
}
