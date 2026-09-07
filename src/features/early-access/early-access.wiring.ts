import { buildContext } from '../../composition/root';
import { wireEarlyAccess } from '../../composition/server/early-access';
import { JoinEarlyAccessUseCase } from '../../core/use-cases/join-early-access.use-case';
import { ResubscribeEarlyAccessUseCase } from '../../core/use-cases/resubscribe-early-access.use-case';
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

  // Task 8 replaces this bounded seam with the confirmation delivery use case.
  const requestConfirmation = async () => undefined;
  return new LocalEarlyAccessBackend(
    deps.serverConfig.releaseStage,
    deps.captchaVerifier,
    join,
    requestConfirmation,
  );
}
