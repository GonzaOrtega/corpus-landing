import type { EarlyAccessSignup } from '../entities/early-access-signup';
import { PersistenceConflictError } from '../errors/early-access-errors';
import type { Clock } from '../ports/clock.port';
import type { TokenGenerator } from '../ports/token-generator.port';
import type { TokenHasher } from '../ports/token-hasher.port';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';
import type { ResubscribeEarlyAccessUseCase } from './resubscribe-early-access.use-case';

export interface JoinEarlyAccessInput {
  emailOriginal: string;
  emailNormalized: string;
  consentVersion: string;
}

export interface JoinEarlyAccessOutput {
  signupId: string;
  shouldSendConfirmation: boolean;
  managementToken: string | null;
}

export class JoinEarlyAccessUseCase {
  constructor(
    private readonly repository: EarlyAccessSignupRepository,
    private readonly clock: Clock,
    private readonly tokenGenerator: TokenGenerator,
    private readonly tokenHasher: TokenHasher,
    private readonly resubscribe: ResubscribeEarlyAccessUseCase,
  ) {}

  async execute(input: JoinEarlyAccessInput): Promise<JoinEarlyAccessOutput> {
    const existing = await this.repository.findCurrentByNormalizedEmail(input.emailNormalized);
    if (existing) return this.resolveExisting(existing, input);

    const managementToken = this.tokenGenerator.generate();
    try {
      const created = await this.repository.create({
        ...input,
        consentedAt: this.clock.now(),
        manageTokenHash: this.tokenHasher.hash(managementToken),
      });
      return {
        signupId: created.id,
        shouldSendConfirmation: true,
        managementToken,
      };
    } catch (error) {
      if (!(error instanceof PersistenceConflictError)) throw error;
      const winner = await this.repository.findCurrentByNormalizedEmail(input.emailNormalized);
      if (!winner) throw error;
      return this.resolveExisting(winner, input);
    }
  }

  private async resolveExisting(
    existing: EarlyAccessSignup,
    input: JoinEarlyAccessInput,
  ): Promise<JoinEarlyAccessOutput> {
    if (existing.toProps().unsubscribedAt !== null) {
      return this.resubscribe.execute(existing, input);
    }
    return {
      signupId: existing.id,
      shouldSendConfirmation: false,
      managementToken: null,
    };
  }
}
