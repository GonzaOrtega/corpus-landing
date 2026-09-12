import { HmacManagementTokenDeriver } from '../../adapters/security/hmac-management-token-deriver.adapter';
import { SendLaunchEmailUseCase } from '../../core/use-cases/send-launch-email.use-case';
import { runLaunchDryRun } from '../../ops/launch-dry-run';
import { runLaunchProduction } from '../../ops/launch-production';
import { provideConfigSecrets } from '../capabilities/config-secrets';
import { provideProductionNotifications } from '../capabilities/notifications';
import { providePersistence } from '../capabilities/persistence';

const systemClock = { now: () => new Date() };

/**
 * Separate composition for a human-gated operation. It intentionally uses
 * production mail delivery even when invoked from a GitHub Actions runner.
 */
export function getLaunchOperations() {
  const configSecrets = provideConfigSecrets();
  const { serverConfig, tokenHasher, logger } = configSecrets;
  if (!serverConfig.managementTokenSecret) {
    throw new Error('MANAGEMENT_TOKEN_SECRET is required for a production launch send');
  }
  const { earlyAccessSignupRepository: repository } = providePersistence(serverConfig);
  const { emailSender: sender } = provideProductionNotifications(serverConfig, logger);
  const tokenDeriver = new HmacManagementTokenDeriver(serverConfig.managementTokenSecret);

  return {
    dryRun: (input: unknown) =>
      runLaunchDryRun({ config: serverConfig, repository, sender }, input),
    production: (command: { input: unknown; dryRunFingerprint: string }) =>
      runLaunchProduction(
        {
          config: serverConfig,
          repository,
          sendLaunch: new SendLaunchEmailUseCase(repository, sender, systemClock),
          clock: systemClock,
          tokenHasher,
          tokenDeriver,
          logger,
        },
        command,
      ),
  };
}
