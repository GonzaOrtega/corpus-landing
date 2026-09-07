import type { Clock } from '../../core/ports/clock.port';
import type { Logger } from '../../core/ports/logger.port';
import type { TokenGenerator } from '../../core/ports/token-generator.port';
import type { TokenHasher } from '../../core/ports/token-hasher.port';
import type { EarlyAccessSignupRepository } from '../../core/repositories/early-access-signup.repository';
import type { AppContext } from '../root';

/** The dependency slice the early-access use cases (Task 6+) need — no more. */
export interface EarlyAccessDeps {
  repository: EarlyAccessSignupRepository;
  clock: Clock;
  tokenGenerator: TokenGenerator;
  tokenHasher: TokenHasher;
  logger: Logger;
}

/**
 * A plain object literal, not a `new *Adapter(` call — Clock has no
 * technology to swap, so it doesn't need a dedicated adapter file or
 * construction inside composition/capabilities/.
 */
const systemClock: Clock = { now: () => new Date() };

export function wireEarlyAccess(ctx: AppContext): EarlyAccessDeps {
  return {
    repository: ctx.earlyAccessSignupRepository,
    clock: systemClock,
    tokenGenerator: ctx.tokenGenerator,
    tokenHasher: ctx.tokenHasher,
    logger: ctx.logger,
  };
}
