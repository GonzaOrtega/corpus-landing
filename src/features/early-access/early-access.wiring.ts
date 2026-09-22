import { provideObservability } from '../../composition/capabilities/observability';
import { buildContext } from '../../composition/root';
import { wireEarlyAccess } from '../../composition/server/early-access';
import type { ErrorReporter } from '../../core/ports/error-reporter.port';
import { JoinEarlyAccessUseCase } from '../../core/use-cases/join-early-access.use-case';
import { ResolveEarlyAccessManagementUseCase } from '../../core/use-cases/resolve-early-access-management.use-case';
import { ResubscribeEarlyAccessUseCase } from '../../core/use-cases/resubscribe-early-access.use-case';
import { SendConfirmationEmailUseCase } from '../../core/use-cases/send-confirmation-email.use-case';
import { UnsubscribeEarlyAccessUseCase } from '../../core/use-cases/unsubscribe-early-access.use-case';
import type { EarlyAccessBackend } from './backend/early-access-backend';
import { LocalEarlyAccessBackend } from './backend/local-early-access-backend';

/**
 * Resolved before the rest of the context on purpose: it never throws, and a
 * Server Action needs somewhere to report that `buildContext()` itself failed
 * (a missing credential, an invalid release stage) — the one failure the
 * full context cannot report about itself.
 */
export function getErrorReporter(): ErrorReporter {
  return provideObservability().errorReporter;
}

export function getEarlyAccessBackend(): EarlyAccessBackend {
  const context = buildContext();
  const deps = wireEarlyAccess(context);
  const resubscribe = new ResubscribeEarlyAccessUseCase(
    deps.repository,
    deps.clock,
    deps.tokenGenerator,
    deps.tokenHasher,
  );
  const join = new JoinEarlyAccessUseCase(
    deps.repository,
    deps.clock,
    deps.tokenGenerator,
    deps.tokenHasher,
    resubscribe,
  );

  const sendConfirmation = new SendConfirmationEmailUseCase(
    deps.repository,
    deps.emailSender,
    deps.clock,
    deps.logger,
    { siteUrl: deps.serverConfig.siteUrl },
  );
  const requestConfirmation = (result: { signupId: string; managementToken: string }) =>
    sendConfirmation.execute(result);
  return new LocalEarlyAccessBackend(
    deps.serverConfig.releaseStage,
    deps.captchaVerifier,
    join,
    requestConfirmation,
  );
}

export function getManagementUseCases() {
  const deps = wireEarlyAccess(buildContext());
  return {
    resolve: new ResolveEarlyAccessManagementUseCase(deps.repository, deps.tokenHasher),
    unsubscribe: new UnsubscribeEarlyAccessUseCase(deps.repository, deps.tokenHasher, deps.clock),
  };
}
