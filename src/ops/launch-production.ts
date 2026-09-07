import type { ServerConfig } from '../config/server-env';
import { EarlyAccessSignup } from '../core/entities/early-access-signup';
import type { Clock } from '../core/ports/clock.port';
import type { EmailSender } from '../core/ports/email-sender.port';
import type { Logger } from '../core/ports/logger.port';
import type { ManagementTokenDeriver } from '../core/ports/management-token-deriver.port';
import type { TokenHasher } from '../core/ports/token-hasher.port';
import type { EarlyAccessSignupRepository } from '../core/repositories/early-access-signup.repository';
import { SendLaunchEmailUseCase } from '../core/use-cases/send-launch-email.use-case';
import { fingerprintLaunchInput, parseLaunchInput } from './launch-fingerprint';

const BATCH_SIZE = 100;

export interface LaunchProductionResult {
  processed: number;
  skipped: number;
}

type LaunchProductionDeps = {
  config: Pick<ServerConfig, 'releaseStage' | 'siteUrl'>;
  repository: EarlyAccessSignupRepository;
  sender: EmailSender;
  clock: Clock;
  tokenHasher: TokenHasher;
  tokenDeriver: ManagementTokenDeriver;
  logger: Logger;
};

function managementUrl(siteUrl: URL, token: string): string {
  const url = new URL('/early-access/manage', siteUrl);
  url.hash = token;
  return url.toString();
}

/**
 * Sends a release exactly once per eligible row. An HMAC-derived link makes
 * retries body-identical while the database keeps only its one-way hash.
 */
export async function runLaunchProduction(
  deps: LaunchProductionDeps,
  command: { input: unknown; dryRunFingerprint: string },
): Promise<LaunchProductionResult> {
  if (deps.config.releaseStage !== 'launched') {
    throw new Error('Production launch send requires CORPUS_RELEASE_STAGE=launched');
  }
  const input = parseLaunchInput(command.input);
  if (fingerprintLaunchInput(input) !== command.dryRunFingerprint) {
    throw new Error('Production release input does not match the approved dry-run fingerprint');
  }

  const sendLaunch = new SendLaunchEmailUseCase(deps.repository, deps.sender, deps.clock);
  let afterId: string | undefined;
  let processed = 0;
  let skipped = 0;

  while (true) {
    const batch = await deps.repository.findLaunchEligible(BATCH_SIZE, afterId);
    if (batch.length === 0) break;

    for (const signup of batch) {
      afterId = signup.id;
      const props = signup.toProps();
      if (props.launchStatus === 'sent' || props.launchStatus === 'manual_review') {
        skipped += 1;
        continue;
      }

      const token = deps.tokenDeriver.deriveLaunchToken(signup.id);
      await deps.repository.save(
        EarlyAccessSignup.fromProps({
          ...props,
          manageTokenHash: deps.tokenHasher.hash(token),
          updatedAt: deps.clock.now(),
        }),
      );
      await sendLaunch.execute({
        signupId: signup.id,
        managementUrl: managementUrl(deps.config.siteUrl, token),
        input,
      });
      const state = (await deps.repository.findById(signup.id))?.toProps().launchStatus;
      deps.logger.info('Launch recipient processed', {
        operation: 'launch_send',
        signupId: signup.id,
        status: state ?? 'missing',
      });
      processed += 1;
    }
    if (batch.length < BATCH_SIZE) break;
  }

  return { processed, skipped };
}
