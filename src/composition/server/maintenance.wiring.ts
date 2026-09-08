import { PurgeExpiredSignupPiiUseCase } from '../../core/use-cases/purge-expired-signup-pii.use-case';
import { RetryFailedConfirmationsUseCase } from '../../core/use-cases/retry-failed-confirmations.use-case';
import { SendConfirmationEmailUseCase } from '../../core/use-cases/send-confirmation-email.use-case';
import { provideConfigSecrets } from '../capabilities/config-secrets';
import { buildContext } from '../root';
import { wireEarlyAccess } from './early-access';

export interface MaintenanceResult {
  confirmationRetriesProcessed: number;
  confirmationExhausted: number;
  unsubscribedAnonymized: number;
  launchedAnonymized: number;
}

const BATCH_SIZE = 100;

export function getMaintenanceOperation() {
  // Authorising the request needs the cron secret and nothing else. Building
  // the rest — persistence, notifications, the production CAPTCHA adapter —
  // happens inside execute, so an unauthenticated caller is rejected without
  // constructing anything on its behalf. Eager construction meant a missing
  // production credential answered anonymous requests with 500 instead of 401.
  const { serverConfig } = provideConfigSecrets();

  return {
    cronSecret: serverConfig.cronSecret,
    execute: async (): Promise<MaintenanceResult> => {
      const deps = wireEarlyAccess(buildContext());
      const sendConfirmation = new SendConfirmationEmailUseCase(
        deps.repository,
        deps.emailSender,
        deps.clock,
        deps.logger,
        { siteUrl: deps.serverConfig.siteUrl },
      );
      const retry = new RetryFailedConfirmationsUseCase(
        deps.repository,
        sendConfirmation,
        deps.clock,
        deps.tokenGenerator,
        deps.tokenHasher,
      );
      const purge = new PurgeExpiredSignupPiiUseCase(deps.repository);
      const startedAt = deps.clock.now();
      const retries = await retry.execute(BATCH_SIZE);
      const anonymized = await purge.execute(deps.clock.now(), BATCH_SIZE);
      const result = {
        confirmationRetriesProcessed: retries.processed,
        confirmationExhausted: retries.exhausted,
        ...anonymized,
      };
      deps.logger.info('Early-access maintenance completed', {
        operation: 'early_access_maintenance',
        status: 'completed',
        aggregateCount:
          result.confirmationRetriesProcessed +
          result.unsubscribedAnonymized +
          result.launchedAnonymized,
        durationMs: deps.clock.now().getTime() - startedAt.getTime(),
      });
      return result;
    },
  };
}
