import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import { ResolveEarlyAccessManagementUseCase } from './resolve-early-access-management.use-case';

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
  const useCase = new ResolveEarlyAccessManagementUseCase(repository, {
    hash: (token) => `hash:${token}`,
  });
  return { repository, signup, useCase };
}

describe('ResolveEarlyAccessManagementUseCase', () => {
  it('returns an active state with a masked email', async () => {
    const { useCase } = await setup();

    await expect(useCase.execute('valid-token')).resolves.toEqual({
      status: 'active',
      maskedEmail: 'g***@example.com',
    });
  });

  it('returns the normal unsubscribed state while the retained token is valid', async () => {
    const { repository, signup, useCase } = await setup();
    await repository.save(
      EarlyAccessSignup.fromProps({ ...signup.toProps(), unsubscribedAt: NOW }),
    );

    await expect(useCase.execute('valid-token')).resolves.toEqual({
      status: 'unsubscribed',
      maskedEmail: 'g***@example.com',
    });
  });

  it.each(['wrong-token', ''])('does not distinguish an invalid token (%j)', async (token) => {
    const { useCase } = await setup();

    await expect(useCase.execute(token)).resolves.toEqual({ status: 'invalid' });
  });

  it('treats an anonymized row as an invalid credential', async () => {
    const { repository, signup, useCase } = await setup();
    await repository.save(
      EarlyAccessSignup.fromProps({
        ...signup.toProps(),
        emailOriginal: null,
        emailNormalized: null,
        manageTokenHash: null,
        anonymizedAt: NOW,
      }),
    );

    await expect(useCase.execute('valid-token')).resolves.toEqual({ status: 'invalid' });
  });
});
