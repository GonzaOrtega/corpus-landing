import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import { DeterministicTokenAdapter } from '../testing/deterministic-token.adapter';
import { FixedClockAdapter } from '../testing/fixed-clock.adapter';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import { ResubscribeEarlyAccessUseCase } from './resubscribe-early-access.use-case';

const NOW = new Date('2026-09-07T12:00:00.000Z');

describe('ResubscribeEarlyAccessUseCase', () => {
  it('reuses the canonical row, rotates its token, and restores launch eligibility', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const created = await repository.create({
      emailOriginal: 'old@example.com',
      emailNormalized: 'person@example.com',
      consentVersion: 'old-consent',
      consentedAt: new Date('2026-08-01T00:00:00.000Z'),
      manageTokenHash: 'old-hash',
    });
    const unsubscribed = EarlyAccessSignup.fromProps({
      ...created.toProps(),
      confirmationStatus: 'sent',
      confirmationSentAt: new Date('2026-08-01T00:01:00.000Z'),
      unsubscribedAt: new Date('2026-08-02T00:00:00.000Z'),
    });
    await repository.save(unsubscribed);
    const useCase = new ResubscribeEarlyAccessUseCase(
      repository,
      new FixedClockAdapter(NOW),
      new DeterministicTokenAdapter(),
      { hash: (token) => `hash:${token}` },
    );

    const result = await useCase.execute(unsubscribed, {
      emailOriginal: 'Person@Example.com',
      emailNormalized: 'person@example.com',
      consentVersion: '2026-09-06',
    });
    const saved = await repository.findById(created.id);

    expect(result).toEqual({
      signupId: created.id,
      shouldSendConfirmation: true,
      managementToken: 'test-token-1',
    });
    expect(saved?.toProps()).toMatchObject({
      id: created.id,
      emailOriginal: 'Person@Example.com',
      emailNormalized: 'person@example.com',
      consentVersion: '2026-09-06',
      consentedAt: NOW,
      updatedAt: NOW,
      unsubscribedAt: null,
      manageTokenHash: 'hash:test-token-1',
      confirmationStatus: 'pending',
      confirmationAttemptCount: 0,
      confirmationLastAttemptAt: null,
      confirmationNextAttemptAt: null,
      confirmationSentAt: null,
    });
    expect(saved?.isLaunchEligible()).toBe(true);
  });
});
