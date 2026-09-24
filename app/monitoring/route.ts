import { provideConfigSecrets } from '@/src/composition/capabilities/config-secrets';
import { isPipelineRun } from '@/src/config/runtime-environment';
import {
  handleMonitoringTunnelRequest,
  MONITORING_TUNNEL_OPERATION,
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
 *
 * Suppression is withheld configuration, so it is written down (R-06).
 * Handing the handler `undefined` is indistinguishable, from inside it, from
 * a deployment that never configured Sentry — which the handler is right to
 * keep quiet about, and which would leave a DSN-carrying runtime that trips a
 * pipeline marker answering 404 to every browser envelope with no trace on
 * either side (the SDK is told nothing and keeps posting). Only this file can
 * tell the two apart, so this is where the line belongs: one `warn` per
 * suppressed request, in the handler's own `operation`/`status`/`errorCode`
 * vocabulary. It stays silent on every runtime this repo controls — the E2E
 * container and the local Lighthouse run both blank the DSN as well as
 * setting the marker — so a line here means a real misconfiguration.
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

  const configuredDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const suppressed = isPipelineRun(process.env);
  if (suppressed && configuredDsn) {
    deps.logger?.warn('Monitoring tunnel is suppressing a configured DSN for a pipeline run', {
      operation: MONITORING_TUNNEL_OPERATION,
      status: 'rejected',
      errorCode: 'pipeline_suppressed',
    });
  }

  return handleMonitoringTunnelRequest(
    request,
    suppressed ? undefined : configuredDsn,
    fetch,
    deps,
  );
}
