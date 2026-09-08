import { describe, expect, it } from 'vitest';
import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { EmailDeliveryOutcome, EmailMessage, EmailSender } from '../ports/email-sender.port';
import { FixedClockAdapter } from '../testing/fixed-clock.adapter';
import { InMemoryEarlyAccessSignupRepository } from '../testing/in-memory-early-access-signup.repository';
import { SendLaunchEmailUseCase } from './send-launch-email.use-case';

const NOW = new Date('2026-09-07T12:00:00.000Z');
const input = {
  releaseVersion: '1.0.0',
  releaseSummary: 'First build.',
  includedFeatures: ['Offline capture'],
  knownLimitations: ['Android only'],
  downloadUrl: new URL('https://downloads.corpus.example/v1'),
};

async function setup(outcome: EmailDeliveryOutcome, beforeSend?: () => Promise<void>) {
  const repository = new InMemoryEarlyAccessSignupRepository();
  const signup = await repository.create({
    emailOriginal: 'person@example.com',
    emailNormalized: 'person@example.com',
    consentVersion: 'v1',
    consentedAt: NOW,
    manageTokenHash: 'hash',
  });
  const messages: EmailMessage[] = [];
  const sender: EmailSender = {
    send: async (message) => {
      messages.push(message);
      await beforeSend?.();
      return outcome;
    },
  };
  const useCase = new SendLaunchEmailUseCase(repository, sender, new FixedClockAdapter(NOW));
  return { repository, signup, messages, useCase };
}

describe('SendLaunchEmailUseCase', () => {
  it('persists sending before the provider call, then marks accepted delivery sent', async () => {
    let repository!: InMemoryEarlyAccessSignupRepository;
    let signupId = '';
    const setupResult = await setup('accepted', async () => {
      expect((await repository.findById(signupId))?.toProps()).toMatchObject({
        launchStatus: 'sending',
        launchAttemptCount: 1,
        launchLastAttemptAt: NOW,
      });
    });
    ({ repository } = setupResult);
    signupId = setupResult.signup.id;

    await setupResult.useCase.execute({
      signupId,
      managementUrl: 'https://corpus.example/early-access/manage#token',
      input,
    });

    expect((await repository.findById(signupId))?.toProps()).toMatchObject({
      launchStatus: 'sent',
      launchAttemptCount: 1,
      launchSentAt: NOW,
    });
    expect(setupResult.messages[0]).toMatchObject({
      kind: 'launch',
      idempotencyKey: `corpus-launch-v1/${signupId}`,
    });
  });

  it.each([
    'known_retryable_failure',
    'known_terminal_failure',
  ] as const)('marks a %s as failed', async (outcome) => {
    const { repository, signup, useCase } = await setup(outcome);
    await useCase.execute({ signupId: signup.id, managementUrl: 'https://x.example/#t', input });
    expect((await repository.findById(signup.id))?.toProps().launchStatus).toBe('failed');
  });

  it('keeps an ambiguous outcome sending for a same-key retry within 24 hours', async () => {
    const { repository, signup, messages, useCase } = await setup('ambiguous');
    const command = { signupId: signup.id, managementUrl: 'https://x.example/#t', input };
    await useCase.execute(command);
    await useCase.execute(command);

    expect((await repository.findById(signup.id))?.toProps().launchStatus).toBe('sending');
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(messages[0]);
    expect(messages[1]?.idempotencyKey).toBe(`corpus-launch-v1/${signup.id}`);
  });

  it('moves an expired ambiguous send to manual review without calling the provider', async () => {
    const { repository, signup, messages, useCase } = await setup('accepted');
    await repository.save(
      EarlyAccessSignup.fromProps({
        ...signup.toProps(),
        launchStatus: 'sending',
        launchAttemptCount: 1,
        launchLastAttemptAt: new Date('2026-09-06T11:59:59.000Z'),
      }),
    );

    await useCase.execute({ signupId: signup.id, managementUrl: 'https://x.example/#t', input });

    expect((await repository.findById(signup.id))?.toProps().launchStatus).toBe('manual_review');
    expect(messages).toHaveLength(0);
  });
});
