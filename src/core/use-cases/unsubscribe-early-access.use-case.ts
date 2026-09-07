import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { Clock } from '../ports/clock.port';
import type { TokenHasher } from '../ports/token-hasher.port';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';

export type UnsubscribeEarlyAccessResult = { status: 'unsubscribed' } | { status: 'invalid' };

export class UnsubscribeEarlyAccessUseCase {
  constructor(
    private readonly repository: EarlyAccessSignupRepository,
    private readonly tokenHasher: TokenHasher,
    private readonly clock: Clock,
  ) {}

  async execute(rawToken: string): Promise<UnsubscribeEarlyAccessResult> {
    if (rawToken.length === 0) return { status: 'invalid' };
    const signup = await this.repository.findByManageTokenHash(this.tokenHasher.hash(rawToken));
    if (!signup) return { status: 'invalid' };

    const props = signup.toProps();
    if (props.anonymizedAt !== null || props.manageTokenHash === null) return { status: 'invalid' };
    if (props.unsubscribedAt !== null) return { status: 'unsubscribed' };

    const now = this.clock.now();
    await this.repository.save(
      EarlyAccessSignup.fromProps({ ...props, unsubscribedAt: now, updatedAt: now }),
    );
    return { status: 'unsubscribed' };
  }
}
