import { handleMonitoringTunnelRequest } from './monitoring-route.handler';

/**
 * Same-origin Sentry tunnel (spec decision 5, R-04). Thin by design: every
 * validation and forwarding rule lives in `monitoring-route.handler.ts`,
 * tested directly with plain Request objects. `proxy.ts`'s matcher already
 * excludes this path from negotiation.
 */
export async function POST(request: Request): Promise<Response> {
  return handleMonitoringTunnelRequest(request, process.env.NEXT_PUBLIC_SENTRY_DSN);
}
