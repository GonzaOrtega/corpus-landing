import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { Clock } from '../ports/clock.port';
import type { TokenGenerator } from '../ports/token-generator.port';
import type { TokenHasher } from '../ports/token-hasher.port';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';
import type { SendConfirmationEmailUseCase } from './send-confirmation-email.use-case';

export class RetryFailedConfirmationsUseCase {
  constructor(
    private readonly repository: EarlyAccessSignupRepository,
    private readonly sendConfirmation: Pick<SendConfirmationEmailUseCase, 'execute'>,
    private readonly clock: Clock,
    private readonly tokenGenerator: TokenGenerator,
    private readonly tokenHasher: TokenHasher,
  ) {}

  async execute(limit: number): Promise<number> {
    const due = await this.repository.findConfirmationsDue(this.clock.now(), limit);
    for (const signup of due) {
      const managementToken = this.tokenGenerator.generate();
      await this.repository.save(
        EarlyAccessSignup.fromProps({
          ...signup.toProps(),
          manageTokenHash: this.tokenHasher.hash(managementToken),
          updatedAt: this.clock.now(),
        }),
      );
      await this.sendConfirmation.execute({ signupId: signup.id, managementToken });
    }
    return due.length;
  }
}
