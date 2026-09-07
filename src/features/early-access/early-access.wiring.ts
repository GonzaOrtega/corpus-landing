import { buildContext } from '../../composition/root';
import { wireEarlyAccess } from '../../composition/server/early-access';
import { JoinEarlyAccessUseCase } from '../../core/use-cases/join-early-access.use-case';
import { ResubscribeEarlyAccessUseCase } from '../../core/use-cases/resubscribe-early-access.use-case';
import { SendConfirmationEmailUseCase } from '../../core/use-cases/send-confirmation-email.use-case';
import type { EarlyAccessBackend } from './backend/early-access-backend';
import { LocalEarlyAccessBackend } from './backend/local-early-access-backend';

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
