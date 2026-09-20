import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EarlyAccessSignup } from '../../core/entities/early-access-signup';
import { InMemoryEarlyAccessSignupRepository } from '../../core/testing/in-memory-early-access-signup.repository';

const harness = vi.hoisted(() => ({
  repository: null as InMemoryEarlyAccessSignupRepository | null,
}));

vi.mock('../capabilities/persistence', () => ({
  providePersistence: () => ({ earlyAccessSignupRepository: harness.repository }),
}));

import { getMaintenanceOperation } from './maintenance.wiring';

const env = {
  SITE_URL: 'https://corpus.example',
  CORPUS_RELEASE_STAGE: 'early-access',
  DATABASE_URL: 'postgres://user:pass@host.example/db',
  DATABASE_URL_UNPOOLED: 'postgres://user:pass@host.example/db',
  CORPUS_FAKE_CAPTCHA: '1',
  CRON_SECRET: 'cron-secret-value',
};

describe('maintenance operation execution', () => {
  beforeEach(() => {
    harness.repository = new InMemoryEarlyAccessSignupRepository();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubEnv('VERCEL_ENV', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retries due confirmations and purges expired PII in one run, reporting both counts', async () => {
    const repository = harness.repository as InMemoryEarlyAccessSignupRepository;
    const longAgo = new Date('2026-01-01T00:00:00.000Z');
    const due = await repository.create({
      emailOriginal: 'due@example.com',
      emailNormalized: 'due@example.com',
      consentVersion: 'v1',
      consentedAt: longAgo,
      manageTokenHash: 'hash-due',
    });
    await repository.save(
      EarlyAccessSignup.fromProps({
        ...due.toProps(),
        confirmationStatus: 'failed',
        confirmationAttemptCount: 1,
        confirmationNextAttemptAt: longAgo,
      }),
    );
    const expired = await repository.create({
      emailOriginal: 'gone@example.com',
      emailNormalized: 'gone@example.com',
      consentVersion: 'v1',
      consentedAt: longAgo,
      manageTokenHash: 'hash-gone',
    });
    await repository.save(
      EarlyAccessSignup.fromProps({ ...expired.toProps(), unsubscribedAt: longAgo }),
    );

    const operation = getMaintenanceOperation();
    const result = await operation.execute();

    expect(operation.cronSecret).toBe('cron-secret-value');
    expect(result).toEqual({
      confirmationRetriesProcessed: 1,
      confirmationExhausted: 0,
      unsubscribedAnonymized: 1,
      launchedAnonymized: 0,
    });
    expect((await repository.findById(due.id))?.toProps().confirmationStatus).toBe('sent');
    expect((await repository.findById(expired.id))?.toProps().emailOriginal).toBeNull();
  });
});
