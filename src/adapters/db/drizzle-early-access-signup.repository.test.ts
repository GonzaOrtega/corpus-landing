import { describe, expect, it } from 'vitest';
import { PersistenceConflictError } from '../../core/errors/early-access-errors';
import { buildSignup, buildSignupProps } from '../../core/testing/early-access-signup.factory';
import { DrizzleEarlyAccessSignupRepository } from './drizzle-early-access-signup.repository';
import type { Database } from './neon-database.adapter';

/**
 * The integration suite proves the SQL against a real database; this suite
 * proves the boundary behaviour a real database cannot produce on demand —
 * driver error translation and empty results — with a structural stand-in.
 */
type Outcome = { rows: unknown[] } | { error: unknown };

/**
 * Every query-builder method returns the same chain, and awaiting the chain
 * settles with the scripted outcome — enough to drive the repository through
 * each of its `.select().from().where().orderBy().limit()` shapes.
 */
function stubDatabase(outcome: Outcome): Database {
  const settle = () =>
    'error' in outcome ? Promise.reject(outcome.error) : Promise.resolve(outcome.rows);
  const chain: unknown = new Proxy(() => chain, {
    get(_target, property) {
      if (property === 'then')
        return (...args: Parameters<Promise<unknown>['then']>) => settle().then(...args);
      return () => chain;
    },
    apply: () => chain,
  });
  return chain as Database;
}

const input = {
  emailOriginal: 'Person@Example.com',
  emailNormalized: 'person@example.com',
  consentVersion: '2026-09-06',
  consentedAt: new Date('2026-09-07T12:00:00.000Z'),
  manageTokenHash: 'hash:token',
};

describe('DrizzleEarlyAccessSignupRepository boundary behaviour', () => {
  it.each([
    ['a driver error carrying the unique-violation code', { code: '23505' }],
    [
      'a Drizzle error whose cause carries the unique-violation code',
      Object.assign(new Error('Failed query: insert ... person@example.com'), {
        cause: { code: '23505' },
      }),
    ],
  ])('translates %s into PersistenceConflictError on create and save', async (_label, error) => {
    const repository = new DrizzleEarlyAccessSignupRepository(stubDatabase({ error }));

    await expect(repository.create(input)).rejects.toBeInstanceOf(PersistenceConflictError);
    await expect(repository.save(buildSignup())).rejects.toBeInstanceOf(PersistenceConflictError);
  });

  it('keeps only the SQLSTATE of any other driver error so no query text or email leaks', async () => {
    const error = Object.assign(
      new Error('Failed query: insert into early_access_signups ... Person@Example.com'),
      { cause: { code: '23502', message: 'null value in column "consent_version"' } },
    );
    const repository = new DrizzleEarlyAccessSignupRepository(stubDatabase({ error }));

    const rejection = await repository.create(input).catch((caught: unknown) => caught);

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe('Database operation failed (code: 23502)');
    expect(JSON.stringify(rejection, Object.getOwnPropertyNames(rejection))).not.toMatch(
      /example\.com|consent_version|insert into/i,
    );
  });

  it.each([
    ['an error without a code', new Error('socket hang up')],
    ['a non-Error rejection', 'timeout'],
  ])('reports %s as a bare failure', async (_label, error) => {
    const repository = new DrizzleEarlyAccessSignupRepository(stubDatabase({ error }));

    await expect(repository.save(buildSignup())).rejects.toThrow('Database operation failed');
  });

  it('treats a write that returns no row as a failure rather than fabricating an entity', async () => {
    const repository = new DrizzleEarlyAccessSignupRepository(stubDatabase({ rows: [] }));

    await expect(repository.create(input)).rejects.toThrow('Database operation failed');
    await expect(repository.save(buildSignup())).rejects.toThrow('Database operation failed');
  });

  it('maps a returned row to the entity on create and save', async () => {
    const row = buildSignupProps();
    const repository = new DrizzleEarlyAccessSignupRepository(stubDatabase({ rows: [row] }));

    expect((await repository.create(input)).toProps()).toEqual(row);
    expect((await repository.save(buildSignup())).toProps()).toEqual(row);
  });

  it('returns null, not undefined, for lookups that find nothing', async () => {
    const repository = new DrizzleEarlyAccessSignupRepository(stubDatabase({ rows: [] }));

    expect(await repository.findById('missing')).toBeNull();
    expect(await repository.findByManageTokenHash('missing')).toBeNull();
    expect(await repository.findCurrentByNormalizedEmail('missing@example.com')).toBeNull();
  });

  it('maps rows for the batch queries and counts zero eligible rows when the count is empty', async () => {
    const row = buildSignupProps();
    const repository = new DrizzleEarlyAccessSignupRepository(stubDatabase({ rows: [row] }));
    const empty = new DrizzleEarlyAccessSignupRepository(stubDatabase({ rows: [] }));

    expect((await repository.findConfirmationsDue(new Date(), 10)).map((r) => r.id)).toEqual([
      row.id,
    ]);
    expect((await repository.findLaunchEligible(10, row.id)).map((r) => r.id)).toEqual([row.id]);
    expect((await repository.findPiiPurgeDue(new Date(), 10)).map((r) => r.id)).toEqual([row.id]);
    expect(await empty.countLaunchEligible()).toBe(0);
    expect(
      await new DrizzleEarlyAccessSignupRepository(
        stubDatabase({ rows: [{ value: 3 }] }),
      ).countLaunchEligible(),
    ).toBe(3);
  });
});
