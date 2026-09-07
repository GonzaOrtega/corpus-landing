import type { ServerConfig } from '../config/server-env';
import type { EmailSender } from '../core/ports/email-sender.port';
import type { EarlyAccessSignupRepository } from '../core/repositories/early-access-signup.repository';
import { fingerprintLaunchInput, parseLaunchInput } from './launch-fingerprint';
import { renderLaunchEmail } from './render-launch-email';

export interface LaunchDryRunResult {
  fingerprint: string;
  eligibleCount: number;
  subject: string;
  html: string;
  text: string;
}

type LaunchDryRunDeps = {
  config: Pick<
    ServerConfig,
    'releaseStage' | 'siteUrl' | 'launchDryRunRecipient' | 'emailPostalAddress'
  >;
  repository: Pick<EarlyAccessSignupRepository, 'countLaunchEligible'>;
  sender: EmailSender;
};

function requireDryRunConfiguration(config: LaunchDryRunDeps['config']): {
  recipient: string;
  postalAddress: string;
} {
  if (config.releaseStage !== 'launched') {
    throw new Error('Launch dry run requires CORPUS_RELEASE_STAGE=launched');
  }
  if (!config.launchDryRunRecipient) {
    throw new Error('LAUNCH_DRY_RUN_RECIPIENT is required for a launch dry run');
  }
  if (!config.emailPostalAddress) {
    throw new Error('EMAIL_POSTAL_ADDRESS is required for a launch dry run');
  }
  return { recipient: config.launchDryRunRecipient, postalAddress: config.emailPostalAddress };
}

/** Sends the exact launch template to the operator, never to subscribers. */
export async function runLaunchDryRun(
  deps: LaunchDryRunDeps,
  rawInput: unknown,
): Promise<LaunchDryRunResult> {
  const input = parseLaunchInput(rawInput);
  const { recipient, postalAddress } = requireDryRunConfiguration(deps.config);
  const fingerprint = fingerprintLaunchInput(input);
  const managementUrl = new URL('/early-access/manage#dry-run', deps.config.siteUrl).toString();
  const rendered = await renderLaunchEmail(input, { managementUrl, postalAddress });
  const eligibleCount = await deps.repository.countLaunchEligible();
  const outcome = await deps.sender.send({
    kind: 'launch',
    to: recipient,
    managementUrl,
    idempotencyKey: `corpus-launch-dry-run-v1/${fingerprint}`,
    ...input,
  });
  if (outcome !== 'accepted')
    throw new Error('Launch dry-run email was not accepted by the provider');

  return { fingerprint, eligibleCount, ...rendered };
}
