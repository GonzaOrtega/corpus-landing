import { describe, expect, it, vi } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import { buildSignup } from '../testing/early-access-signup.factory';
import { FixedClockAdapter } from '../testing/fixed-clock.adapter';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import { UnsubscribeEarlyAccessUseCase } from './unsubscribe-early-access.use-case';

const NOW = new Date('2026-09-07T12:00:00.000Z');

async function setup() {
  const repository = new InMemoryEarlyAccessSignupRepository();
  const signup = await repository.create({
    emailOriginal: 'gonza@example.com',
    emailNormalized: 'gonza@example.com',
    consentVersion: 'v1',
    consentedAt: NOW,
    manageTokenHash: 'hash:valid-token',
  });
  const useCase = new UnsubscribeEarlyAccessUseCase(
    repository,
    { hash: (token) => `hash:${token}` },
    new FixedClockAdapter(NOW),
  );
  return { repository, signup, useCase };
}

describe('UnsubscribeEarlyAccessUseCase', () => {
  it('unsubscribes only when explicitly executed and preserves the token during retention', async () => {
    const { repository, signup, useCase } = await setup();

    await expect(useCase.execute('valid-token')).resolves.toEqual({ status: 'unsubscribed' });
    expect((await repository.findById(signup.id))?.toProps()).toMatchObject({
      unsubscribedAt: NOW,
      updatedAt: NOW,
      manageTokenHash: 'hash:valid-token',
    });
  });

  it('is idempotent for an already-unsubscribed signup', async () => {
    const { repository, signup, useCase } = await setup();
    const firstTime = new Date('2026-09-01T00:00:00.000Z');
    await repository.save(
      EarlyAccessSignup.fromProps({ ...signup.toProps(), unsubscribedAt: firstTime }),
    );

    await expect(useCase.execute('valid-token')).resolves.toEqual({ status: 'unsubscribed' });
    expect((await repository.findById(signup.id))?.toProps().unsubscribedAt).toEqual(firstTime);
  });

  it('returns the same invalid state for missing and invalidated credentials', async () => {
    const { useCase } = await setup();

    await expect(useCase.execute('wrong-token')).resolves.toEqual({ status: 'invalid' });
  });

  it('does not touch the repository for an empty token', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const lookup = vi.spyOn(repository, 'findByManageTokenHash');
    const useCase = new UnsubscribeEarlyAccessUseCase(
      repository,
      { hash: (token) => `hash:${token}` },
      new FixedClockAdapter(NOW),
    );

    await expect(useCase.execute('')).resolves.toEqual({ status: 'invalid' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    ['anonymized but still carrying a token hash', { anonymizedAt: NOW }],
    ['missing its token hash', { manageTokenHash: null }],
  ] as const)('never unsubscribes a row that is %s', async (_label, overrides) => {
    const row = buildSignup({ manageTokenHash: 'hash:valid-token', ...overrides });
    const saved: EarlyAccessSignup[] = [];
    const repository = Object.assign(new InMemoryEarlyAccessSignupRepository(), {
      findByManageTokenHash: async () => row,
      save: async (signup: EarlyAccessSignup) => {
        saved.push(signup);
        return signup;
      },
    });
    const useCase = new UnsubscribeEarlyAccessUseCase(
      repository,
      { hash: (token) => `hash:${token}` },
      new FixedClockAdapter(NOW),
    );

    await expect(useCase.execute('valid-token')).resolves.toEqual({ status: 'invalid' });
    expect(saved).toHaveLength(0);
  });
});
