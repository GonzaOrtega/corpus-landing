import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEarlyAccessSignupRepository } from '../../core/testing/in-memory-early-access-signup.repository';
import { ResolveEarlyAccessManagementUseCase } from '../../core/use-cases/resolve-early-access-management.use-case';
import { UnsubscribeEarlyAccessUseCase } from '../../core/use-cases/unsubscribe-early-access.use-case';
import { LocalEarlyAccessBackend } from './backend/local-early-access-backend';

const harness = vi.hoisted(() => ({
  repository: null as InMemoryEarlyAccessSignupRepository | null,
}));

vi.mock('../../composition/capabilities/persistence', () => ({
  providePersistence: () => ({ earlyAccessSignupRepository: harness.repository }),
}));

import { getEarlyAccessBackend, getManagementUseCases } from './early-access.wiring';

const env = {
  SITE_URL: 'https://corpus.example',
  CORPUS_RELEASE_STAGE: 'early-access',
  DATABASE_URL: 'postgres://user:pass@host.example/db',
  DATABASE_URL_UNPOOLED: 'postgres://user:pass@host.example/db',
  CORPUS_FAKE_CAPTCHA: '1',
};

describe('early-access wiring', () => {
  beforeEach(() => {
    harness.repository = new InMemoryEarlyAccessSignupRepository();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubEnv('VERCEL_ENV', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('composes a backend whose join persists the signup and sends its confirmation', async () => {
    const repository = harness.repository as InMemoryEarlyAccessSignupRepository;
    const backend = getEarlyAccessBackend();

    expect(backend).toBeInstanceOf(LocalEarlyAccessBackend);
    await backend.join({
      emailOriginal: 'Person@Example.com',
      emailNormalized: 'person@example.com',
      captchaToken: 'test-pass',
    });

    const saved = await repository.findCurrentByNormalizedEmail('person@example.com');
    expect(saved?.toProps()).toMatchObject({
      emailOriginal: 'Person@Example.com',
      confirmationStatus: 'sent',
      confirmationAttemptCount: 1,
    });
  });

  it('composes the management use cases over the same repository', async () => {
    const { resolve, unsubscribe } = getManagementUseCases();

    expect(resolve).toBeInstanceOf(ResolveEarlyAccessManagementUseCase);
    expect(unsubscribe).toBeInstanceOf(UnsubscribeEarlyAccessUseCase);
    await expect(resolve.execute('')).resolves.toEqual({ status: 'invalid' });
    await expect(unsubscribe.execute('unknown')).resolves.toEqual({ status: 'invalid' });
  });
});
