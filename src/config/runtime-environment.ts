/**
 * Pipeline detection shared by every capability that must never reach a real
 * third party from CI, Vitest, or the E2E container (spec §34: excluded "by
 * explicit pipeline signal rather than by absent configuration").
 *
 *   CI                      compose's e2e service sets it, as does GitHub Actions
 *   NODE_ENV === 'test'     Vitest
 *   E2E_NEON_HTTP_ENDPOINT  a run pointed at the ephemeral E2E database
 *
 * A marker counts only when it carries a value that means "yes" — being
 * merely defined is not a signal (see `DISABLED_MARKERS`).
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

/**
 * A marker that carries one of these means "no", not "yes" — `CI=` from a
 * shell that exported an unset variable, or a platform that spells a disabled
 * flag `false`/`0`. Spec §34 asks for an *explicit* signal, and a variable
 * that is merely defined is not one: treating it as a signal turns an
 * accidental empty value into a silent shutdown of everything that keys off
 * this check (the /monitoring tunnel, the server SDK, the real email sender).
 * Every runtime this repo controls sets `CI: 'true'` (compose.yaml,
 * lighthouserc.cjs) and GitHub Actions does the same, so nothing legitimate
 * relies on bare definedness.
 */
const DISABLED_MARKERS: ReadonlySet<string> = new Set(['', '0', 'false']);

const markerIsSet = (value: string | undefined): boolean =>
  value !== undefined && !DISABLED_MARKERS.has(value.trim().toLowerCase());

export const isPipelineRun = (env: PipelineSignals): boolean =>
  markerIsSet(env.CI) || env.NODE_ENV === 'test' || markerIsSet(env.E2E_NEON_HTTP_ENDPOINT);
