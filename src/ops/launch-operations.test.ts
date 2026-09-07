import { describe, expect, it } from 'vitest';
import { HmacManagementTokenDeriver } from '../adapters/security/hmac-management-token-deriver.adapter';
import { Sha256TokenHasherAdapter } from '../adapters/security/sha256-token-hasher.adapter';
import { EarlyAccessSignup } from '../core/entities/early-access-signup';
import type { EmailMessage } from '../core/ports/email-sender.port';
import type { EarlyAccessLogFields } from '../core/ports/logger.port';
import { FixedClockAdapter } from '../core/testing/fixed-clock.adapter';
import { InMemoryEarlyAccessSignupRepository } from '../core/testing/in-memory-early-access-signup.repository';
import { runLaunchDryRun } from './launch-dry-run';
import { fingerprintLaunchInput } from './launch-fingerprint';
import { runLaunchProduction } from './launch-production';

const input = {
  releaseVersion: '1.0.0',
  releaseSummary: 'Corpus is ready.',
  includedFeatures: ['Living Lexicon'],
  knownLimitations: ['Android only'],
  downloadUrl: 'https://play.google.com/store/apps/details?id=app.corpus',
};

const launchedConfig = {
  releaseStage: 'launched' as const,
  siteUrl: new URL('https://corpus.example'),
  launchDryRunRecipient: 'operator@example.com',
  emailPostalAddress: '123 Example Street',
  managementTokenSecret: 'a'.repeat(32),
};

class RecordingEmailSender {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<'accepted'> {
    this.messages.push(message);
    return 'accepted';
  }
}

class RecordingLogger {
  readonly entries: EarlyAccessLogFields[] = [];
  info(_message: string, fields: EarlyAccessLogFields): void {
    this.entries.push(fields);
  }
  warn(): void {}
  error(): void {}
}

describe('launch operations', () => {
  it('creates a deterministic fingerprint for the complete validated release payload', () => {
    expect(fingerprintLaunchInput(input)).toBe(fingerprintLaunchInput({ ...input }));
    expect(fingerprintLaunchInput({ ...input, releaseVersion: '1.0.1' })).not.toBe(
      fingerprintLaunchInput(input),
    );
  });

  it('dry-runs only to the configured operator and never mutates a subscriber', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const sender = new RecordingEmailSender();

    const result = await runLaunchDryRun({ config: launchedConfig, repository, sender }, input);

    expect(result.eligibleCount).toBe(0);
    expect(result.html).toContain('Corpus is ready');
    expect(result.text).toContain('Corpus is ready');
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]).toMatchObject({
      kind: 'launch',
      to: 'operator@example.com',
    });
    expect(await repository.findLaunchEligible(100)).toEqual([]);
  });

  it('rejects a production send unless it receives the exact dry-run fingerprint', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const sender = new RecordingEmailSender();
    const logger = new RecordingLogger();

    await expect(
      runLaunchProduction(
        {
          config: launchedConfig,
          repository,
          sender,
          clock: new FixedClockAdapter(new Date('2026-09-07T00:00:00.000Z')),
          tokenHasher: new Sha256TokenHasherAdapter(),
          tokenDeriver: new HmacManagementTokenDeriver(launchedConfig.managementTokenSecret),
          logger,
        },
        { input, dryRunFingerprint: 'not-the-dry-run' },
      ),
    ).rejects.toThrow('does not match');
    expect(sender.messages).toEqual([]);
  });

  it('processes only eligible subscribers and logs UUID/state without email fields', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const sender = new RecordingEmailSender();
    const logger = new RecordingLogger();
    const now = new Date('2026-09-07T00:00:00.000Z');
    const eligible = await repository.create({
      emailOriginal: 'eligible@example.com',
      emailNormalized: 'eligible@example.com',
      consentVersion: 'v1',
      consentedAt: now,
      manageTokenHash: 'old-hash',
    });
    const unsubscribed = await repository.create({
      emailOriginal: 'unsubscribed@example.com',
      emailNormalized: 'unsubscribed@example.com',
      consentVersion: 'v1',
      consentedAt: now,
      manageTokenHash: 'old-hash-2',
    });
    await repository.save(
      EarlyAccessSignup.fromProps({
        ...unsubscribed.toProps(),
        unsubscribedAt: now,
      }),
    );

    const result = await runLaunchProduction(
      {
        config: launchedConfig,
        repository,
        sender,
        clock: new FixedClockAdapter(now),
        tokenHasher: new Sha256TokenHasherAdapter(),
        tokenDeriver: new HmacManagementTokenDeriver(launchedConfig.managementTokenSecret),
        logger,
      },
      { input, dryRunFingerprint: fingerprintLaunchInput(input) },
    );

    expect(result).toEqual({ processed: 1, skipped: 0 });
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]).toMatchObject({ kind: 'launch', to: 'eligible@example.com' });
    expect((await repository.findById(eligible.id))!.toProps().launchStatus).toBe('sent');
    expect(logger.entries).toEqual([
      { operation: 'launch_send', signupId: eligible.id, status: 'sent' },
    ]);
  });
});
