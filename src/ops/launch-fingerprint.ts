import { createHash } from 'node:crypto';
import { type LaunchEmailInput, launchInputSchema } from './launch-input.schema';

/**
 * The JSON key order is explicit so equivalent validated release inputs
 * produce the same approval fingerprint on every machine.
 */
function canonicalize(input: LaunchEmailInput): string {
  return JSON.stringify({
    releaseVersion: input.releaseVersion,
    releaseSummary: input.releaseSummary,
    includedFeatures: input.includedFeatures,
    knownLimitations: input.knownLimitations,
    downloadUrl: input.downloadUrl.toString(),
  });
}

export function parseLaunchInput(input: unknown): LaunchEmailInput {
  return launchInputSchema.strict().parse(input);
}

export function fingerprintLaunchInput(input: unknown): string {
  const validated =
    typeof input === 'object' &&
    input !== null &&
    'downloadUrl' in input &&
    (input as { downloadUrl?: unknown }).downloadUrl instanceof URL
      ? (input as LaunchEmailInput)
      : parseLaunchInput(input);
  return createHash('sha256').update(canonicalize(validated)).digest('hex');
}
