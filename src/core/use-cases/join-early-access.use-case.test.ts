import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import { PersistenceConflictError } from '../errors/early-access-errors';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';
import { DeterministicTokenAdapter } from '../testing/deterministic-token.adapter';
import { FixedClockAdapter } from '../testing/fixed-clock.adapter';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import { JoinEarlyAccessUseCase } from './join-early-access.use-case';
import { ResubscribeEarlyAccessUseCase } from './resubscribe-early-access.use-case';

const NOW = new Date('2026-09-07T12:00:00.000Z');
const INPUT = {
  emailOriginal: 'Person@Example.com',
  emailNormalized: 'person@example.com',
  consentVersion: '2026-09-06',
};

function buildUseCase(repository: EarlyAccessSignupRepository) {
  const clock = new FixedClockAdapter(NOW);
  const tokenGenerator = new DeterministicTokenAdapter();
  const tokenHasher = { hash: (token: string) => `hash:${token}` };
  const resubscribe = new ResubscribeEarlyAccessUseCase(
    repository,
    clock,
    tokenGenerator,
    tokenHasher,
  );
  return new JoinEarlyAccessUseCase(repository, clock, tokenGenerator, tokenHasher, resubscribe);
}

describe('JoinEarlyAccessUseCase', () => {
  it('creates one pending signup and returns the raw token only to orchestration', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const useCase = buildUseCase(repository);

    const result = await useCase.execute(INPUT);
    const saved = await repository.findById(result.signupId);

    expect(result).toEqual({
      signupId: expect.any(String),
      shouldSendConfirmation: true,
      managementToken: 'test-token-1',
    });
    expect(saved?.toProps()).toMatchObject({
      emailOriginal: 'Person@Example.com',
      emailNormalized: 'person@example.com',
      manageTokenHash: 'hash:test-token-1',
      confirmationStatus: 'pending',
      consentedAt: NOW,
    });
    expect(await repository.countLaunchEligible()).toBe(1);
  });

  it('returns a non-enumerating success without creating or confirming an active duplicate', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const existing = await repository.create({
      ...INPUT,
      consentedAt: NOW,
      manageTokenHash: 'stored-hash',
    });
    await repository.save(
      EarlyAccessSignup.fromProps({
        ...existing.toProps(),
        confirmationStatus: 'sent',
        confirmationSentAt: NOW,
      }),
    );
    const useCase = buildUseCase(repository);

    const result = await useCase.execute(INPUT);

    expect(result).toEqual({
      signupId: existing.id,
      shouldSendConfirmation: false,
      managementToken: null,
    });
    expect(await repository.countLaunchEligible()).toBe(1);
  });

  it('recovers from a create race by re-reading the canonical row', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const existing = await repository.create({
      ...INPUT,
      consentedAt: NOW,
      manageTokenHash: 'winner-hash',
    });
    let firstLookup = true;
    const racingRepository: EarlyAccessSignupRepository = {
      findCurrentByNormalizedEmail: async (email) => {
        if (firstLookup) {
          firstLookup = false;
          return null;
        }
        return repository.findCurrentByNormalizedEmail(email);
      },
      findByManageTokenHash: (hash) => repository.findByManageTokenHash(hash),
      findById: (id) => repository.findById(id),
      create: async () => {
        throw new PersistenceConflictError();
      },
      save: (signup) => repository.save(signup),
      findConfirmationsDue: (at, limit) => repository.findConfirmationsDue(at, limit),
      findLaunchEligible: (limit, afterId) => repository.findLaunchEligible(limit, afterId),
      findPiiPurgeDue: (at, limit) => repository.findPiiPurgeDue(at, limit),
      countLaunchEligible: () => repository.countLaunchEligible(),
    };
    const useCase = buildUseCase(racingRepository);

    const result = await useCase.execute(INPUT);

    expect(result).toEqual({
      signupId: existing.id,
      shouldSendConfirmation: false,
      managementToken: null,
    });
  });
});
