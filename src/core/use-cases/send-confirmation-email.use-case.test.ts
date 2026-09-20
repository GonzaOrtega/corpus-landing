import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { EmailDeliveryOutcome, EmailMessage, EmailSender } from '../ports/email-sender.port';
import type { EarlyAccessLogFields, Logger } from '../ports/logger.port';
import { FixedClockAdapter } from '../testing/fixed-clock.adapter';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import { SendConfirmationEmailUseCase } from './send-confirmation-email.use-case';

const NOW = new Date('2026-09-07T12:00:00.000Z');

class ScriptedEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];
  constructor(private readonly outcome: EmailDeliveryOutcome) {}
  async send(message: EmailMessage): Promise<EmailDeliveryOutcome> {
    this.messages.push(message);
    return this.outcome;
  }
}

class RecordingLogger implements Logger {
  readonly errors: EarlyAccessLogFields[] = [];
  info(): void {}
  warn(): void {}
  error(_message: string, fields: EarlyAccessLogFields): void {
    this.errors.push(fields);
  }
}

async function setup(outcome: EmailDeliveryOutcome) {
  const repository = new InMemoryEarlyAccessSignupRepository();
  const signup = await repository.create({
    emailOriginal: 'Person@Example.com',
    emailNormalized: 'person@example.com',
    consentVersion: 'v1',
    consentedAt: NOW,
    manageTokenHash: 'hash:raw-token',
  });
  const sender = new ScriptedEmailSender(outcome);
  const logger = new RecordingLogger();
  const useCase = new SendConfirmationEmailUseCase(
    repository,
    sender,
    new FixedClockAdapter(NOW),
    logger,
    { siteUrl: new URL('https://corpus.example') },
  );
  return { repository, signup, sender, logger, useCase };
}

describe('SendConfirmationEmailUseCase', () => {
  it('marks an accepted first attempt sent', async () => {
    const { repository, signup, sender, useCase } = await setup('accepted');

    await useCase.execute({ signupId: signup.id, managementToken: 'raw-token' });
    const saved = await repository.findById(signup.id);

    expect(saved?.toProps()).toMatchObject({
      confirmationStatus: 'sent',
      confirmationAttemptCount: 1,
      confirmationLastAttemptAt: NOW,
      confirmationNextAttemptAt: null,
      confirmationSentAt: NOW,
    });
    expect(sender.messages[0]).toMatchObject({
      kind: 'confirmation',
      to: 'Person@Example.com',
      managementUrl: 'https://corpus.example/early-access/manage#raw-token',
      idempotencyKey: `corpus-confirmation-v1/${signup.id}/1`,
    });
  });

  it('schedules a known retryable failure for the next daily opportunity', async () => {
    const { repository, signup, logger, useCase } = await setup('known_retryable_failure');

    await useCase.execute({ signupId: signup.id, managementToken: 'raw-token' });

    expect((await repository.findById(signup.id))?.toProps()).toMatchObject({
      confirmationStatus: 'failed',
      confirmationAttemptCount: 1,
      confirmationNextAttemptAt: new Date('2026-09-08T12:00:00.000Z'),
      confirmationSentAt: null,
    });
    expect(logger.errors).toEqual([
      {
        operation: 'send_confirmation',
        signupId: signup.id,
        status: 'failed',
        errorCode: 'RETRYABLE_PROVIDER_FAILURE',
        attemptCount: 1,
      },
    ]);
  });

  it.each(['known_terminal_failure', 'ambiguous'] as const)(
    'exhausts a %s outcome immediately without affecting launch eligibility',
    async (outcome) => {
      const { repository, signup, logger, useCase } = await setup(outcome);

      await useCase.execute({ signupId: signup.id, managementToken: 'raw-token' });
      const saved = await repository.findById(signup.id);

      expect(saved?.toProps()).toMatchObject({
        confirmationStatus: 'exhausted',
        confirmationAttemptCount: 1,
        confirmationNextAttemptAt: null,
      });
      expect(saved?.isLaunchEligible()).toBe(true);
      expect(logger.errors).toEqual([
        {
          operation: 'send_confirmation',
          signupId: signup.id,
          status: 'exhausted',
          errorCode:
            outcome === 'ambiguous' ? 'AMBIGUOUS_PROVIDER_OUTCOME' : 'TERMINAL_PROVIDER_FAILURE',
          attemptCount: 1,
        },
      ]);
    },
  );

  it('does nothing for an unknown signup', async () => {
    const { sender, logger, useCase } = await setup('accepted');

    await useCase.execute({ signupId: 'missing', managementToken: 'raw-token' });

    expect(sender.messages).toHaveLength(0);
    expect(logger.errors).toHaveLength(0);
  });

  it.each([
    ['has no email address', { emailOriginal: null }],
    ['is anonymized', { anonymizedAt: NOW }],
  ] as const)('does not send when the signup %s', async (_label, overrides) => {
    const { repository, signup, sender, useCase } = await setup('accepted');
    const stored = EarlyAccessSignup.fromProps({ ...signup.toProps(), ...overrides });
    await repository.save(stored);

    await useCase.execute({ signupId: signup.id, managementToken: 'raw-token' });

    expect(sender.messages).toHaveLength(0);
    expect((await repository.findById(signup.id))?.toProps()).toEqual(stored.toProps());
  });

  it('treats a provider that throws as ambiguous and exhausts the row', async () => {
    const repository = new InMemoryEarlyAccessSignupRepository();
    const signup = await repository.create({
      emailOriginal: 'person@example.com',
      emailNormalized: 'person@example.com',
      consentVersion: 'v1',
      consentedAt: NOW,
      manageTokenHash: 'hash',
    });
    const logger = new RecordingLogger();
    const sender: EmailSender = {
      send: async () => {
        throw new Error('provider unreachable');
      },
    };
    const useCase = new SendConfirmationEmailUseCase(
      repository,
      sender,
      new FixedClockAdapter(NOW),
      logger,
      { siteUrl: new URL('https://corpus.example') },
    );

    await useCase.execute({ signupId: signup.id, managementToken: 'raw-token' });

    expect((await repository.findById(signup.id))?.toProps()).toMatchObject({
      confirmationStatus: 'exhausted',
      confirmationAttemptCount: 1,
      confirmationNextAttemptAt: null,
    });
    expect(logger.errors[0]).toMatchObject({ errorCode: 'AMBIGUOUS_PROVIDER_OUTCOME' });
  });
});
