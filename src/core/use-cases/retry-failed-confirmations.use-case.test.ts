import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { EmailDeliveryOutcome, EmailMessage, EmailSender } from '../ports/email-sender.port';
import type { Logger } from '../ports/logger.port';
import { DeterministicTokenAdapter } from '../testing/deterministic-token.adapter';
import { FixedClockAdapter } from '../testing/fixed-clock.adapter';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import { RetryFailedConfirmationsUseCase } from './retry-failed-confirmations.use-case';
import { SendConfirmationEmailUseCase } from './send-confirmation-email.use-case';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const logger: Logger = { info() {}, warn() {}, error() {} };

class SequenceSender implements EmailSender {
  readonly messages: EmailMessage[] = [];
  constructor(private readonly outcomes: EmailDeliveryOutcome[]) {}
  async send(message: EmailMessage): Promise<EmailDeliveryOutcome> {
    this.messages.push(message);
    return this.outcomes.shift() ?? 'known_terminal_failure';
  }
}

async function setup(outcomes: EmailDeliveryOutcome[]) {
  const repository = new InMemoryEarlyAccessSignupRepository();
  const created = await repository.create({
    emailOriginal: 'person@example.com',
    emailNormalized: 'person@example.com',
    consentVersion: 'v1',
    consentedAt: new Date('2026-09-01T00:00:00.000Z'),
    manageTokenHash: 'old-hash',
  });
  await repository.save(
    EarlyAccessSignup.fromProps({
      ...created.toProps(),
      confirmationStatus: 'failed',
      confirmationAttemptCount: 1,
      confirmationLastAttemptAt: new Date('2026-09-07T12:00:00.000Z'),
      confirmationNextAttemptAt: NOW,
    }),
  );
  const sender = new SequenceSender(outcomes);
  const clock = new FixedClockAdapter(NOW);
  const sendConfirmation = new SendConfirmationEmailUseCase(repository, sender, clock, logger, {
    siteUrl: new URL('https://corpus.example'),
  });
  const useCase = new RetryFailedConfirmationsUseCase(
    repository,
    sendConfirmation,
    clock,
    new DeterministicTokenAdapter(),
    { hash: (token) => `hash:${token}` },
  );
  return { repository, created, sender, useCase };
}

describe('RetryFailedConfirmationsUseCase', () => {
  it('rotates the management token and sends a due second attempt', async () => {
    const { repository, created, sender, useCase } = await setup(['accepted']);

    await expect(useCase.execute(100)).resolves.toEqual({ processed: 1, exhausted: 0 });
    const saved = await repository.findById(created.id);

    expect(saved?.toProps()).toMatchObject({
      manageTokenHash: 'hash:test-token-1',
      confirmationStatus: 'sent',
      confirmationAttemptCount: 2,
    });
    expect(sender.messages[0]?.managementUrl).toContain('#test-token-1');
  });

  it('exhausts after the third known failure and never schedules a fourth attempt', async () => {
    const { repository, created, useCase } = await setup(['known_retryable_failure']);
    const secondAttempt = await repository.findById(created.id);
    await repository.save(
      EarlyAccessSignup.fromProps({
        ...secondAttempt!.toProps(),
        confirmationAttemptCount: 2,
      }),
    );

    await expect(useCase.execute(100)).resolves.toEqual({ processed: 1, exhausted: 1 });

    expect((await repository.findById(created.id))?.toProps()).toMatchObject({
      confirmationStatus: 'exhausted',
      confirmationAttemptCount: 3,
      confirmationNextAttemptAt: null,
    });
  });
});
