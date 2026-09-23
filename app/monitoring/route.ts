import { provideConfigSecrets } from '@/src/composition/capabilities/config-secrets';
import { isPipelineRun } from '@/src/config/runtime-environment';
import {
  handleMonitoringTunnelRequest,
  type MonitoringTunnelDeps,
} from './monitoring-route.handler';

/**
 * Same-origin Sentry tunnel (spec decision 5, R-04). Thin by design: every
 * validation, rejection and forwarding rule lives in
 * `monitoring-route.handler.ts`, tested directly with plain Request objects.
 * `proxy.ts`'s matcher already excludes this path from negotiation.
 *
 * `provideConfigSecrets()` — not the full composition root — is the same
 * narrow slice `maintenance.wiring.ts` reaches for before its own auth
 * check: this route has no auth check at all (R-40), so it must not
 * construct anything heavier (persistence, notifications) on an
 * unauthenticated caller's behalf. It supplies the Logger port (R-29) and
 * this deployment's own site origin for the handler's Origin check (R-40) —
 * both derived from this deployment's own configuration, never from the
 * request.
 *
 * If server configuration itself fails to load, the tunnel must not go down
 * with it: the handler's DSN and org/project checks (R-04) need nothing from
 * here to keep doing their job, so a config failure only costs this request
 * its logging and its Origin check, not its correctness.
 *
 * A pipeline run (CI, Vitest, the E2E container, a local Lighthouse run)
 * forwards nothing, whatever DSN the build inlined (R-27). A `.next` built
 * with a real DSN still ships a browser SDK that posts here, and blanking
 * the variable at `next start` cannot reach the value already inlined into
 * this handler; the pipeline signal is read from the runtime environment,
 * so it can. Without a DSN the handler answers 404, as it does on any
 * deployment where Sentry is not configured.
 */
export async function POST(request: Request): Promise<Response> {
  let deps: MonitoringTunnelDeps = {};
  try {
    const { logger, serverConfig } = provideConfigSecrets();
    deps = { logger, siteOrigin: serverConfig.siteUrl.origin };
  } catch {
    console.error(
      'Monitoring tunnel: server configuration unavailable; continuing without logging',
    );
  }
  const dsn = isPipelineRun(process.env) ? undefined : process.env.NEXT_PUBLIC_SENTRY_DSN;
  return handleMonitoringTunnelRequest(request, dsn, fetch, deps);
}
