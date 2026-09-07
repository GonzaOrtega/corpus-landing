import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
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
});
