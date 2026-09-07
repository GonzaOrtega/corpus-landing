import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { Clock } from '../ports/clock.port';
import type { TokenGenerator } from '../ports/token-generator.port';
import type { TokenHasher } from '../ports/token-hasher.port';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';
import type { JoinEarlyAccessInput, JoinEarlyAccessOutput } from './join-early-access.use-case';

export class ResubscribeEarlyAccessUseCase {
  constructor(
    private readonly repository: EarlyAccessSignupRepository,
    private readonly clock: Clock,
    private readonly tokenGenerator: TokenGenerator,
    private readonly tokenHasher: TokenHasher,
  ) {}

  async execute(
    existing: EarlyAccessSignup,
    input: JoinEarlyAccessInput,
  ): Promise<JoinEarlyAccessOutput> {
    const now = this.clock.now();
    const managementToken = this.tokenGenerator.generate();
    const resubscribed = EarlyAccessSignup.fromProps({
      ...existing.toProps(),
      emailOriginal: input.emailOriginal,
      emailNormalized: input.emailNormalized,
      consentVersion: input.consentVersion,
      consentedAt: now,
      updatedAt: now,
      unsubscribedAt: null,
      manageTokenHash: this.tokenHasher.hash(managementToken),
      confirmationStatus: 'pending',
      confirmationAttemptCount: 0,
      confirmationLastAttemptAt: null,
      confirmationNextAttemptAt: null,
      confirmationSentAt: null,
    });

    const saved = await this.repository.save(resubscribed);
    return {
      signupId: saved.id,
      shouldSendConfirmation: true,
      managementToken,
    };
  }
}
