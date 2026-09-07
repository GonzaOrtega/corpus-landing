/**
 * The site has exactly two release stages (spec §3). Nothing else is valid —
 * `parseReleaseStage` throws rather than silently defaulting, so a typo'd
 * environment variable fails loudly at boot instead of quietly running as
 * the wrong stage.
 */
export type ReleaseStage = 'early-access' | 'launched';

const RELEASE_STAGES: readonly ReleaseStage[] = ['early-access', 'launched'];

export function parseReleaseStage(value: string): ReleaseStage {
  if ((RELEASE_STAGES as readonly string[]).includes(value)) {
    return value as ReleaseStage;
  }
  throw new Error(
    `Invalid CORPUS_RELEASE_STAGE "${value}" — expected one of: ${RELEASE_STAGES.join(', ')}`,
  );
}

/** Signup is only accepted while the site is in early-access (spec §3.2). */
export function isSignupOpen(stage: ReleaseStage): boolean {
  return stage === 'early-access';
}
