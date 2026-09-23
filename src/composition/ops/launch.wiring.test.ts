import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailMessage } from '../../core/ports/email-sender.port';
import { InMemoryEarlyAccessSignupRepository } from '../../core/testing/in-memory-early-access-signup.repository';

const harness = vi.hoisted(() => ({
  repository: null as InMemoryEarlyAccessSignupRepository | null,
  messages: [] as EmailMessage[],
  provideProductionNotifications: vi.fn(),
  provideNotifications: vi.fn(),
}));

vi.mock('../capabilities/persistence', () => ({
  providePersistence: () => ({ earlyAccessSignupRepository: harness.repository }),
}));
vi.mock('../capabilities/notifications', () => ({
  provideProductionNotifications: harness.provideProductionNotifications,
  provideNotifications: harness.provideNotifications,
}));

import { getLaunchOperations } from './launch.wiring';

const env = {
  SITE_URL: 'https://corpus.example',
  CORPUS_RELEASE_STAGE: 'launched',
  CORPUS_DOWNLOAD_URL: 'https://play.google.com/store/apps/details?id=app.corpus',
  DATABASE_URL: 'postgres://user:pass@host.example/db',
  DATABASE_URL_UNPOOLED: 'postgres://user:pass@host.example/db',
  LAUNCH_DRY_RUN_RECIPIENT: 'operator@example.com',
  EMAIL_POSTAL_ADDRESS: '123 Example Street',
  MANAGEMENT_TOKEN_SECRET: 'launch-management-secret-with-32-bytes!!',
};

const input = {
  releaseVersion: '1.0.0',
  releaseSummary: 'Corpus is ready.',
  includedFeatures: ['Living Lexicon'],
  knownLimitations: ['Android only'],
  downloadUrl: 'https://play.google.com/store/apps/details?id=app.corpus',
};

describe('getLaunchOperations', () => {
  beforeEach(() => {
    harness.repository = new InMemoryEarlyAccessSignupRepository();
    harness.messages = [];
    harness.provideProductionNotifications.mockReset().mockReturnValue({
      emailSender: {
        send: async (message: EmailMessage) => {
          harness.messages.push(message);
          return 'accepted' as const;
        },
      },
    });
    harness.provideNotifications.mockReset();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses to compose without the management token secret', () => {
    vi.stubEnv('MANAGEMENT_TOKEN_SECRET', undefined);

    expect(() => getLaunchOperations()).toThrow(
      'MANAGEMENT_TOKEN_SECRET is required for a production launch send',
    );
  });

  it('propagates the HMAC byte-length rule for a short secret', () => {
    vi.stubEnv('MANAGEMENT_TOKEN_SECRET', 'too-short');

    expect(() => getLaunchOperations()).toThrow('at least 32 bytes');
  });

  it('always wires production mail, even on a pipeline host', () => {
    vi.stubEnv('CI', 'true');

    const operations = getLaunchOperations();

    expect(harness.provideProductionNotifications).toHaveBeenCalledTimes(1);
    expect(harness.provideNotifications).not.toHaveBeenCalled();
    expect(typeof operations.dryRun).toBe('function');
    expect(typeof operations.production).toBe('function');
  });

  it('runs a dry run that sends exactly one message to the operator', async () => {
    const result = await getLaunchOperations().dryRun(input);

    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.eligibleCount).toBe(0);
    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]).toMatchObject({ kind: 'launch', to: 'operator@example.com' });
  });

  it('rejects a production send whose input does not match the approved fingerprint', async () => {
    await expect(
      getLaunchOperations().production({ input, dryRunFingerprint: 'not-the-dry-run' }),
    ).rejects.toThrow('does not match the approved dry-run fingerprint');
    expect(harness.messages).toHaveLength(0);
  });

  it('sends the release to an eligible subscriber through the composed use case', async () => {
    const repository = harness.repository as InMemoryEarlyAccessSignupRepository;
    const signup = await repository.create({
      emailOriginal: 'person@example.com',
      emailNormalized: 'person@example.com',
      consentVersion: 'v1',
      consentedAt: new Date('2026-09-01T00:00:00.000Z'),
      manageTokenHash: 'hash',
    });
    const operations = getLaunchOperations();
    const { fingerprint } = await operations.dryRun(input);
    harness.messages = [];

    const result = await operations.production({ input, dryRunFingerprint: fingerprint });

    expect(result).toEqual({ processed: 1, skipped: 0 });
    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]).toMatchObject({ kind: 'launch', to: 'person@example.com' });
    expect((await repository.findById(signup.id))?.toProps().launchStatus).toBe('sent');
  });
});
