import type { ServerConfig } from '../../config/server-env';
import type { CaptchaVerifier } from '../../core/ports/captcha-verifier.port';
import type { Clock } from '../../core/ports/clock.port';
import type { EmailSender } from '../../core/ports/email-sender.port';
import type { ErrorReporter } from '../../core/ports/error-reporter.port';
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
  serverConfig: ServerConfig;
  captchaVerifier: CaptchaVerifier;
  emailSender: EmailSender;
  errorReporter: ErrorReporter;
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
    serverConfig: ctx.serverConfig,
    captchaVerifier: ctx.captchaVerifier,
    emailSender: ctx.emailSender,
    errorReporter: ctx.errorReporter,
  };
}
