import { describe, expect, it } from 'vitest';
import { HmacManagementTokenDeriver } from '../adapters/security/hmac-management-token-deriver.adapter';
import { Sha256TokenHasherAdapter } from '../adapters/security/sha256-token-hasher.adapter';
import { EarlyAccessSignup } from '../core/entities/early-access-signup';
import type { EmailMessage } from '../core/ports/email-sender.port';
import type { EarlyAccessLogFields } from '../core/ports/logger.port';
import { FixedClockAdapter } from '../core/testing/fixed-clock.adapter';
import { InMemoryEarlyAccessSignupRepository } from '../core/testing/in-memory-early-access-signup.repository';
import { SendLaunchEmailUseCase } from '../core/use-cases/send-launch-email.use-case';
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
    const clock = new FixedClockAdapter(new Date('2026-09-07T00:00:00.000Z'));

    await expect(
      runLaunchProduction(
        {
          config: launchedConfig,
          repository,
          sendLaunch: new SendLaunchEmailUseCase(repository, sender, clock),
          clock,
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
    const clock = new FixedClockAdapter(now);
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
        sendLaunch: new SendLaunchEmailUseCase(repository, sender, clock),
        clock,
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

  it.each([
    [
      'the site is not launched',
      { ...launchedConfig, releaseStage: 'early-access' as const },
      'requires CORPUS_RELEASE_STAGE=launched',
    ],
    [
      'no dry-run recipient is configured',
      { ...launchedConfig, launchDryRunRecipient: null },
      'LAUNCH_DRY_RUN_RECIPIENT is required',
    ],
    [
      'no postal address is configured',
      { ...launchedConfig, emailPostalAddress: null },
      'EMAIL_POSTAL_ADDRESS is required',
    ],
  ])('refuses a dry run when %s', async (_label, config, message) => {
    const sender = new RecordingEmailSender();

    await expect(
      runLaunchDryRun(
        { config, repository: new InMemoryEarlyAccessSignupRepository(), sender },
        input,
      ),
    ).rejects.toThrow(message);
    expect(sender.messages).toEqual([]);
  });

  it('fails the dry run when the provider does not accept the operator message', async () => {
    const sender = { send: async () => 'known_terminal_failure' as const };

    await expect(
      runLaunchDryRun(
        { config: launchedConfig, repository: new InMemoryEarlyAccessSignupRepository(), sender },
        input,
      ),
    ).rejects.toThrow('was not accepted by the provider');
  });

  it('refuses a production send unless the site is launched', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const sender = new RecordingEmailSender();
    const clock = new FixedClockAdapter(new Date('2026-09-07T00:00:00.000Z'));

    await expect(
      runLaunchProduction(
        {
          config: { ...launchedConfig, releaseStage: 'early-access' },
          repository,
          sendLaunch: new SendLaunchEmailUseCase(repository, sender, clock),
          clock,
          tokenHasher: new Sha256TokenHasherAdapter(),
          tokenDeriver: new HmacManagementTokenDeriver(launchedConfig.managementTokenSecret),
          logger: new RecordingLogger(),
        },
        { input, dryRunFingerprint: fingerprintLaunchInput(input) },
      ),
    ).rejects.toThrow('requires CORPUS_RELEASE_STAGE=launched');
    expect(sender.messages).toEqual([]);
  });

  it('skips rows already sent or under manual review and never re-derives their token', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const sender = new RecordingEmailSender();
    const now = new Date('2026-09-07T00:00:00.000Z');
    const clock = new FixedClockAdapter(now);
    for (const [suffix, launchStatus] of [
      ['sent', 'sent'],
      ['review', 'manual_review'],
    ] as const) {
      const created = await repository.create({
        emailOriginal: `${suffix}@example.com`,
        emailNormalized: `${suffix}@example.com`,
        consentVersion: 'v1',
        consentedAt: now,
        manageTokenHash: `hash-${suffix}`,
      });
      await repository.save(EarlyAccessSignup.fromProps({ ...created.toProps(), launchStatus }));
    }

    const result = await runLaunchProduction(
      {
        config: launchedConfig,
        repository,
        sendLaunch: new SendLaunchEmailUseCase(repository, sender, clock),
        clock,
        tokenHasher: new Sha256TokenHasherAdapter(),
        tokenDeriver: new HmacManagementTokenDeriver(launchedConfig.managementTokenSecret),
        logger: new RecordingLogger(),
      },
      { input, dryRunFingerprint: fingerprintLaunchInput(input) },
    );

    expect(result).toEqual({ processed: 0, skipped: 2 });
    expect(sender.messages).toEqual([]);
    expect(
      (await repository.findLaunchEligible(10)).map((row) => row.toProps().manageTokenHash).sort(),
    ).toEqual(['hash-review', 'hash-sent']);
  });

  it('logs a missing state when a processed row vanishes before it is re-read', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const logger = new RecordingLogger();
    const now = new Date('2026-09-07T00:00:00.000Z');
    const clock = new FixedClockAdapter(now);
    const signup = await repository.create({
      emailOriginal: 'eligible@example.com',
      emailNormalized: 'eligible@example.com',
      consentVersion: 'v1',
      consentedAt: now,
      manageTokenHash: 'old-hash',
    });
    const vanishing = Object.assign(repository, { findById: async () => null });

    const result = await runLaunchProduction(
      {
        config: launchedConfig,
        repository: vanishing,
        sendLaunch: { execute: async () => {} },
        clock,
        tokenHasher: new Sha256TokenHasherAdapter(),
        tokenDeriver: new HmacManagementTokenDeriver(launchedConfig.managementTokenSecret),
        logger,
      },
      { input, dryRunFingerprint: fingerprintLaunchInput(input) },
    );

    expect(result).toEqual({ processed: 1, skipped: 0 });
    expect(logger.entries).toEqual([
      { operation: 'launch_send', signupId: signup.id, status: 'missing' },
    ]);
  });

  it('completes immediately when nobody is eligible', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const sender = new RecordingEmailSender();
    const clock = new FixedClockAdapter(new Date('2026-09-07T00:00:00.000Z'));

    const result = await runLaunchProduction(
      {
        config: launchedConfig,
        repository,
        sendLaunch: new SendLaunchEmailUseCase(repository, sender, clock),
        clock,
        tokenHasher: new Sha256TokenHasherAdapter(),
        tokenDeriver: new HmacManagementTokenDeriver(launchedConfig.managementTokenSecret),
        logger: new RecordingLogger(),
      },
      { input, dryRunFingerprint: fingerprintLaunchInput(input) },
    );

    expect(result).toEqual({ processed: 0, skipped: 0 });
    expect(sender.messages).toEqual([]);
  });

  it('pages through a full batch and stops on the empty page that follows it', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const now = new Date('2026-09-07T00:00:00.000Z');
    for (let index = 0; index < 100; index += 1) {
      await repository.create({
        emailOriginal: `person-${index}@example.com`,
        emailNormalized: `person-${index}@example.com`,
        consentVersion: 'v1',
        consentedAt: now,
        manageTokenHash: `hash-${index}`,
      });
    }
    const pages: Array<string | undefined> = [];
    const paged = Object.assign(repository, {
      findLaunchEligible: (limit: number, afterId?: string) => {
        pages.push(afterId);
        return InMemoryEarlyAccessSignupRepository.prototype.findLaunchEligible.call(
          repository,
          limit,
          afterId,
        );
      },
    });
    const sent: string[] = [];

    const result = await runLaunchProduction(
      {
        config: launchedConfig,
        repository: paged,
        sendLaunch: {
          execute: async ({ signupId }) => {
            sent.push(signupId);
          },
        },
        clock: new FixedClockAdapter(now),
        tokenHasher: new Sha256TokenHasherAdapter(),
        tokenDeriver: new HmacManagementTokenDeriver(launchedConfig.managementTokenSecret),
        logger: new RecordingLogger(),
      },
      { input, dryRunFingerprint: fingerprintLaunchInput(input) },
    );

    expect(result).toEqual({ processed: 100, skipped: 0 });
    expect(new Set(sent).size).toBe(100);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toBeUndefined();
    expect(pages[1]).toBe(sent.at(-1));
  });
});
