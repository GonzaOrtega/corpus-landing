import { EarlyAccessSignup, type EarlyAccessSignupProps } from '../entities/early-access-signup';

const DEFAULT_AT = new Date('2026-09-01T00:00:00.000Z');

/**
 * Builds the full 19-field props of a fresh, active, pending signup so tests
 * override only the lifecycle facts they are about. Defaults match what
 * `InMemoryEarlyAccessSignupRepository.create` and `toInsertValues` produce.
 */
export function buildSignupProps(
  overrides: Partial<EarlyAccessSignupProps> = {},
): EarlyAccessSignupProps {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    emailOriginal: 'Person@Example.com',
    emailNormalized: 'person@example.com',
    consentVersion: '2026-09-06',
    consentedAt: DEFAULT_AT,
    createdAt: DEFAULT_AT,
    updatedAt: DEFAULT_AT,
    unsubscribedAt: null,
    anonymizedAt: null,
    manageTokenHash: 'hash:test-token',
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
  };
}

/** Builds an `EarlyAccessSignup` entity from {@link buildSignupProps}. */
export function buildSignup(overrides: Partial<EarlyAccessSignupProps> = {}): EarlyAccessSignup {
  return EarlyAccessSignup.fromProps(buildSignupProps(overrides));
}
