/**
 * Pipeline detection shared by every capability that must never reach a real
 * third party from CI, Vitest, or the E2E container (spec §34: excluded "by
 * explicit pipeline signal rather than by absent configuration").
 *
 *   CI                      compose's e2e service sets it, as does GitHub Actions
 *   NODE_ENV === 'test'     Vitest
 *   E2E_NEON_HTTP_ENDPOINT  a run pointed at the ephemeral E2E database
 *
 * The signal has to be explicit because the E2E runtime bind-mounts the
 * repository and loads `.env.local`, so real credentials are readable inside
 * the container even though nothing there may use them.
 */
export interface PipelineSignals {
  CI?: string;
  NODE_ENV?: string;
  E2E_NEON_HTTP_ENDPOINT?: string;
}

export const isPipelineRun = (env: PipelineSignals): boolean =>
  env.CI !== undefined || env.NODE_ENV === 'test' || env.E2E_NEON_HTTP_ENDPOINT !== undefined;
