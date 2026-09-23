import { describe, expect, it, vi } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import { buildSignup } from '../testing/early-access-signup.factory';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import {
  maskEmail,
  ResolveEarlyAccessManagementUseCase,
} from './resolve-early-access-management.use-case';

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

  it('does not touch the repository for an empty token', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const lookup = vi.spyOn(repository, 'findByManageTokenHash');
    const useCase = new ResolveEarlyAccessManagementUseCase(repository, {
      hash: (token) => `hash:${token}`,
    });

    await expect(useCase.execute('')).resolves.toEqual({ status: 'invalid' });
    expect(lookup).not.toHaveBeenCalled();
  });

  // A repository must never hand back a row in these states for a token lookup,
  // but the use case guards each fact independently rather than trusting it.
  it.each([
    ['anonymized but still carrying a token hash', { anonymizedAt: NOW }],
    ['missing its original email', { emailOriginal: null }],
    ['missing its token hash', { manageTokenHash: null }],
  ] as const)('treats a row that is %s as an invalid credential', async (_label, overrides) => {
    const row = buildSignup({ manageTokenHash: 'hash:valid-token', ...overrides });
    const repository = Object.assign(new InMemoryEarlyAccessSignupRepository(), {
      findByManageTokenHash: async () => row,
    });
    const useCase = new ResolveEarlyAccessManagementUseCase(repository, {
      hash: (token) => `hash:${token}`,
    });

    await expect(useCase.execute('valid-token')).resolves.toEqual({ status: 'invalid' });
  });

  it('masks everything but the first character of the local part', () => {
    expect(maskEmail('gonza@example.com')).toBe('g***@example.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('first.last@sub.example.org')).toBe('f***@sub.example.org');
  });
});
