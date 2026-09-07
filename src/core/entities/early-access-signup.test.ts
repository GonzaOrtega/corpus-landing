import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup, type EarlyAccessSignupProps } from './early-access-signup';

function buildSignup(overrides: Partial<EarlyAccessSignupProps> = {}): EarlyAccessSignup {
  const now = new Date('2026-09-06T00:00:00Z');
  return EarlyAccessSignup.fromProps({
    id: 'signup-1',
    emailOriginal: 'Person@Example.com',
    emailNormalized: 'person@example.com',
    consentVersion: '2026-09-01',
    consentedAt: now,
    createdAt: now,
    updatedAt: now,
    unsubscribedAt: null,
    anonymizedAt: null,
    manageTokenHash: 'hash',
    confirmationStatus: 'pending',
    confirmationAttemptCount: 0,
    confirmationLastAttemptAt: null,
    confirmationNextAttemptAt: null,
    confirmationSentAt: null,
    launchStatus: 'pending',
    launchAttemptCount: 0,
    launchLastAttemptAt: null,
    launchSentAt: null,
    ...overrides,
  });
}

describe('EarlyAccessSignup.isIdentifiable', () => {
  it('is true for an active signup', () => {
    expect(buildSignup().isIdentifiable()).toBe(true);
  });

  it('is false once anonymized — §6.5', () => {
    const anonymized = buildSignup({
      anonymizedAt: new Date('2026-10-06T00:00:00Z'),
      emailOriginal: null,
      emailNormalized: null,
      manageTokenHash: null,
    });
    expect(anonymized.isIdentifiable()).toBe(false);
  });
});

describe('EarlyAccessSignup.isLaunchEligible', () => {
  it('is true for an active, subscribed signup', () => {
    expect(buildSignup().isLaunchEligible()).toBe(true);
  });

  it('is false once unsubscribed — §6.3', () => {
    const unsubscribed = buildSignup({ unsubscribedAt: new Date('2026-09-10T00:00:00Z') });
    expect(unsubscribed.isLaunchEligible()).toBe(false);
  });

  it('is false once anonymized', () => {
    const anonymized = buildSignup({
      anonymizedAt: new Date('2026-10-06T00:00:00Z'),
      emailOriginal: null,
      emailNormalized: null,
      manageTokenHash: null,
    });
    expect(anonymized.isLaunchEligible()).toBe(false);
  });
});
