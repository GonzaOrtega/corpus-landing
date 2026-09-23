import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import { buildSignup } from '../testing/early-access-signup.factory';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import { PurgeExpiredSignupPiiUseCase } from './purge-expired-signup-pii.use-case';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const DUE = new Date('2026-09-08T11:59:59.000Z');

async function createSignup(repository: InMemoryEarlyAccessSignupRepository, suffix: string) {
  return repository.create({
    emailOriginal: `${suffix}@example.com`,
    emailNormalized: `${suffix}@example.com`,
    consentVersion: 'v1',
    consentedAt: DUE,
    manageTokenHash: `hash:${suffix}`,
  });
}

describe('PurgeExpiredSignupPiiUseCase', () => {
  it('removes all PII 30 days after unsubscribe while keeping lifecycle facts', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const signup = await createSignup(repository, 'unsubscribed');
    await repository.save(
      EarlyAccessSignup.fromProps({ ...signup.toProps(), unsubscribedAt: DUE }),
    );

    const result = await new PurgeExpiredSignupPiiUseCase(repository).execute(NOW, 100);
    const saved = await repository.findById(signup.id);

    expect(result).toEqual({ unsubscribedAnonymized: 1, launchedAnonymized: 0 });
    expect(saved?.toProps()).toMatchObject({
      emailOriginal: null,
      emailNormalized: null,
      manageTokenHash: null,
      anonymizedAt: NOW,
      unsubscribedAt: DUE,
    });
  });

  it('removes all PII 30 days after launch delivery', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const signup = await createSignup(repository, 'launched');
    await repository.save(
      EarlyAccessSignup.fromProps({ ...signup.toProps(), launchSentAt: DUE, launchStatus: 'sent' }),
    );

    await expect(new PurgeExpiredSignupPiiUseCase(repository).execute(NOW, 100)).resolves.toEqual({
      unsubscribedAnonymized: 0,
      launchedAnonymized: 1,
    });
  });

  it('does not purge a signup before the retention boundary', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const signup = await createSignup(repository, 'recent');
    await repository.save(
      EarlyAccessSignup.fromProps({
        ...signup.toProps(),
        unsubscribedAt: new Date('2026-09-09T12:00:00.000Z'),
      }),
    );

    await expect(new PurgeExpiredSignupPiiUseCase(repository).execute(NOW, 100)).resolves.toEqual({
      unsubscribedAnonymized: 0,
      launchedAnonymized: 0,
    });
    expect((await repository.findById(signup.id))?.toProps().emailOriginal).toBe(
      'recent@example.com',
    );
  });

  // The repository query only returns rows past one of the two retention
  // boundaries, so this row cannot come back from a real implementation. The
  // use case still anonymizes whatever it is handed and counts only what it can
  // attribute, rather than trusting the query.
  it('anonymizes a due row it cannot attribute to either boundary without counting it', async () => {
    const row = buildSignup();
    const saved: EarlyAccessSignup[] = [];
    const repository = Object.assign(new InMemoryEarlyAccessSignupRepository(), {
      findPiiPurgeDue: async () => [row],
      save: async (signup: EarlyAccessSignup) => {
        saved.push(signup);
        return signup;
      },
    });

    const result = await new PurgeExpiredSignupPiiUseCase(repository).execute(NOW, 100);

    expect(result).toEqual({ unsubscribedAnonymized: 0, launchedAnonymized: 0 });
    expect(saved[0]?.toProps()).toMatchObject({
      emailOriginal: null,
      emailNormalized: null,
      manageTokenHash: null,
      anonymizedAt: NOW,
    });
  });
});
