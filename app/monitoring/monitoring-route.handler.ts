import { buildIngestUrl, parseSentryDsn } from '@/src/config/sentry-options';

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Sentry envelopes from this deployment are small text payloads — errors,
 * logs, spans; no attachments, no Session Replay (spec §25). 200 KB is
 * generous headroom over anything this site emits, and bounds the cost of a
 * hostile POST: every forwarded request is a billed Vercel invocation and
 * egress on this project's Sentry account (R-04).
 */
const MAX_ENVELOPE_BYTES = 200_000;

function declaredOversized(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  return contentLength !== null && Number(contentLength) > MAX_ENVELOPE_BYTES;
}

/**
 * A same-origin tunnel this project controls, in place of the Sentry build
 * plugin's `tunnelRoute` option (R-04, see `SENTRY_TUNNEL_ROUTE`'s comment
 * in `sentry-options.ts`). `dsn` is this deployment's own
 * `NEXT_PUBLIC_SENTRY_DSN` — read server-side by the route so the check runs
 * even though the same value is also inlined into the browser bundle. Only
 * ever forwards to the ingest host derived from that DSN, never from the
 * request: a caller cannot redirect this project's traffic to a different
 * Sentry org or project by naming one in `?o=&p=`.
 */
export async function handleMonitoringTunnelRequest(
  request: Request,
  dsn: string | undefined,
  forward: Fetch = fetch,
): Promise<Response> {
  const expected = parseSentryDsn(dsn);
  if (!expected) return new Response(null, { status: 404 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('o') !== expected.orgId || searchParams.get('p') !== expected.projectId) {
    return new Response(null, { status: 403 });
  }

  if (declaredOversized(request)) return new Response(null, { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_ENVELOPE_BYTES) return new Response(null, { status: 413 });

  try {
    const upstream = await forward(buildIngestUrl(expected), {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') ?? 'application/x-sentry-envelope',
      },
      body,
    });
    // The SDK's transport reads these two headers to back off on rate
    // limiting; nothing else from Sentry's response is relayed onto this
    // origin (no Set-Cookie, no upstream Strict-Transport-Security, etc).
    const headers = new Headers();
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) headers.set('retry-after', retryAfter);
    const rateLimits = upstream.headers.get('x-sentry-rate-limits');
    if (rateLimits) headers.set('x-sentry-rate-limits', rateLimits);
    return new Response(null, { status: upstream.status, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
