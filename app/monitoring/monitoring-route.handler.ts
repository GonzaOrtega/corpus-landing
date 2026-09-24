import { buildIngestUrl, parseSentryDsn } from '@/src/config/sentry-options';
import type { Logger } from '@/src/core/ports/logger.port';

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Sentry envelopes from this deployment are small text payloads — errors,
 * logs, spans; no attachments, no Session Replay (spec §25). 200 KB is
 * generous headroom over anything this site emits, and bounds the cost of a
 * hostile POST: every forwarded request is a billed Vercel invocation and
 * egress on this project's Sentry account (R-04).
 */
const MAX_ENVELOPE_BYTES = 200_000;

/**
 * A no-op by default so a caller that doesn't care about logging (most of
 * the existing tests) never has to construct one. A plain object literal,
 * not a `new *Adapter(` call — the same reasoning as `systemClock` in
 * `early-access.ts`: there is no technology to swap here, so it doesn't earn
 * a construction site under `composition/capabilities/`.
 */
const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** The one operation name every monitoring-tunnel log line carries, including the suppression line `route.ts` writes before this handler is ever called. */
export const MONITORING_TUNNEL_OPERATION = 'monitoring_tunnel';

/** The exception's class name only — never its message, which can carry a URL, a header value, or upstream response detail (spec §24). */
function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : 'non_error_thrown';
}

function reject(logger: Logger, status: number, errorCode: string, message: string): Response {
  logger.warn(message, { operation: MONITORING_TUNNEL_OPERATION, status: 'rejected', errorCode });
  return new Response(null, { status });
}

/**
 * A cross-site page can drive this endpoint with a same-origin-free, `simple`
 * POST — no preflight required, so CORS itself blocks nothing here (R-40).
 * `Origin` is a forbidden header name a page's own script cannot set or
 * suppress: the browser attaches it itself for any non-GET/HEAD request,
 * same-origin included, specifically so a server can make exactly this
 * decision without relying on CORS. Verified against the vendored SDK
 * (`@sentry/browser`'s fetch transport, `node_modules/@sentry/browser/...
 * /transports/fetch.js`): it never sets `mode: 'no-cors'` and never touches
 * the `Origin` header, so a legitimate same-origin post always carries one
 * that matches this deployment's own origin.
 *
 * Best-effort, not the primary defense — that is still the org/project match
 * below, plus the Vercel Firewall rule this project documents in
 * `docs/operations/sentry.md` (rate limiting is out of reach here: a
 * serverless function has no shared memory for a correct in-process limiter,
 * and a database-backed one would put write load on Neon for exactly the
 * flood it is trying to absorb). Two failure-open choices follow from that:
 * a request with no `Origin` header is allowed (some legitimate callers,
 * proxies or tooling omit it, and this check must never be the reason a real
 * report is dropped), and a caller that could not supply `siteOrigin` (a
 * broken `ServerConfig`, see `route.ts`) skips the check entirely rather than
 * rejecting everything.
 */
function isForeignOrigin(request: Request, siteOrigin: string | undefined): boolean {
  if (!siteOrigin) return false;
  const origin = request.headers.get('origin');
  return origin !== null && origin !== siteOrigin;
}

function declaredOversized(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  return contentLength !== null && Number(contentLength) > MAX_ENVELOPE_BYTES;
}

/**
 * Either the body, or why there isn't one: `oversized` is a decision this
 * code made, `unreadable` is the request stream faulting under it. The two
 * carry different status codes and different log lines, so a discriminated
 * result keeps them apart where a bare `null` could not. Only `unreadable`
 * carries a class, because only it has an exception behind it (R-23).
 */
type BoundedBody =
  | { readonly ok: true; readonly body: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly reason: 'oversized' }
  | { readonly ok: false; readonly reason: 'unreadable'; readonly failureClass: string };

/**
 * Stopping is already decided by the time this is called, so a `cancel()`
 * that rejects — the usual case being a stream that has already errored,
 * which rejects with that same error — must not escape and turn one outcome
 * into a different one. Cleanup only, never a signal.
 */
async function cancelQuietly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Best-effort: the connection is going away either way.
  }
}

/**
 * The body, or a reason there is none (R-46, R-05). Read chunk by chunk so a
 * body that declares no size — chunked transfer encoding — is cut off at the
 * limit instead of being buffered whole first: `arrayBuffer()` would hold
 * everything a caller sends before any check could run. The stream is
 * cancelled at the limit, so the rest is never read.
 *
 * A caller that aborts or resets mid-POST errors the stream instead of
 * ending it, and that rejection is caught here rather than left to escape
 * the handler: an unhandled rejection would be answered by the platform with
 * a generic error and no log line at all — the one fault this file exists to
 * make visible. The caught error's class comes back with the reason (R-23):
 * a routine abort and a platform-side read fault arrive on the same path,
 * and the class is the only thing that tells them apart downstream.
 */
async function readBounded(request: Request, limit: number): Promise<BoundedBody> {
  if (!request.body) return { ok: true, body: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await cancelQuietly(reader);
        return { ok: false, reason: 'oversized' };
      }
      chunks.push(value);
    }
  } catch (error) {
    await cancelQuietly(reader);
    return { ok: false, reason: 'unreadable', failureClass: errorClass(error) };
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body };
}

export interface MonitoringTunnelDeps {
  /** The project's Logger port (spec §24 allowlist) — see `route.ts` for how it's obtained. Defaults to a no-op so existing call sites are unaffected. */
  logger?: Logger;
  /** This deployment's own origin, derived from `ServerConfig.siteUrl` — never from the request. See `isForeignOrigin`. */
  siteOrigin?: string;
}

/**
 * A same-origin tunnel this project controls, in place of the Sentry build
 * plugin's `tunnelRoute` option (R-04, see `SENTRY_TUNNEL_ROUTE`'s comment
 * in `sentry-options.ts`). `dsn` is this deployment's own
 * `NEXT_PUBLIC_SENTRY_DSN` — read server-side by the route so the check runs
 * even though the same value is also inlined into the browser bundle. Only
 * ever forwards to the ingest host derived from that DSN, never from the
 * request or the envelope body: a caller cannot redirect this project's
 * traffic to a different Sentry org or project by naming one in `?o=&p=`, or
 * inside the envelope's own `dsn` line (R-34).
 *
 * Every rejection and fault is logged (R-29): a tunnel that starts rejecting
 * or failing must be visible, not indistinguishable from a quiet week. A
 * successful forward stays silent — that is the expected, high-volume case,
 * and per-request logging on it would recreate the exact per-event cost this
 * design otherwise avoids. Rejections use `warn`, not `error`: they are the
 * expected shape of hostile or stale traffic, and the Sentry Pino
 * integration turns `error`-level lines into issues, which the runbook's
 * "new issue" alert should reserve for genuine faults — the two `error`-level
 * `catch` blocks below, which use a distinct message each, so a forward
 * failure (Sentry unreachable) is never conflated with a fault while
 * assembling the response to an already-successful forward. A request body
 * that errors mid-read (`readBounded`) is the third fault path, and a `warn`
 * rather than an `error`: the stream breaks because a caller went away, so it
 * belongs with the rejections and must not raise an issue per dropped
 * connection. That level is only safe because the line says what broke — its
 * `errorCode` carries the stream error's class alongside the constant, so a
 * server-side read regression, which would silently stop every browser error
 * report from arriving, does not read as one more routine abort (R-23).
 */
export async function handleMonitoringTunnelRequest(
  request: Request,
  dsn: string | undefined,
  forward: Fetch = fetch,
  deps: MonitoringTunnelDeps = {},
): Promise<Response> {
  const { logger = noopLogger, siteOrigin } = deps;

  const expected = parseSentryDsn(dsn);
  if (!expected) {
    // A blank/unset DSN is this deployment simply not having Sentry
    // configured — routine, and not worth a line every time this public
    // endpoint is probed. A DSN that was *provided* but doesn't parse is a
    // configuration regression (a typo, a rotated project, a non-SaaS host)
    // and is exactly the silent failure R-29 exists to surface.
    if (dsn) {
      logger.warn('Monitoring tunnel DSN is configured but not usable', {
        operation: MONITORING_TUNNEL_OPERATION,
        status: 'rejected',
        errorCode: 'dsn_unparseable',
      });
    }
    return new Response(null, { status: 404 });
  }

  if (isForeignOrigin(request, siteOrigin)) {
    return reject(logger, 403, 'foreign_origin', 'Monitoring tunnel rejected a cross-site request');
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get('o') !== expected.orgId || searchParams.get('p') !== expected.projectId) {
    return reject(
      logger,
      403,
      'org_project_mismatch',
      'Monitoring tunnel rejected an org/project mismatch',
    );
  }

  if (declaredOversized(request)) {
    return reject(
      logger,
      413,
      'oversized_declared',
      'Monitoring tunnel rejected an oversized envelope',
    );
  }
  const envelope = await readBounded(request, MAX_ENVELOPE_BYTES);
  if (!envelope.ok) {
    return envelope.reason === 'oversized'
      ? reject(logger, 413, 'oversized_actual', 'Monitoring tunnel rejected an oversized envelope')
      : // The class rides inside `errorCode` rather than a field of its own:
        // spec §24's allowlist (`logger.port.ts`) has no slot for a second
        // one, and adapters strip anything outside it at runtime. Same shape
        // as `PROVIDER_STATUS_<n>` in the Resend adapter — the constant
        // prefix stays greppable, the suffix says which fault it was.
        reject(
          logger,
          400,
          `body_read_failed:${envelope.failureClass}`,
          'Monitoring tunnel could not read a request body',
        );
  }

  let upstream: Response;
  try {
    upstream = await forward(buildIngestUrl(expected), {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') ?? 'application/x-sentry-envelope',
      },
      body: envelope.body,
    });
  } catch (error) {
    logger.error('Monitoring tunnel failed to reach Sentry', {
      operation: MONITORING_TUNNEL_OPERATION,
      status: 'failed',
      errorCode: errorClass(error),
    });
    return new Response(null, { status: 502 });
  }

  try {
    // The SDK's transport reads these two headers to back off on rate
    // limiting; nothing else from Sentry's response is relayed onto this
    // origin (no Set-Cookie, no upstream Strict-Transport-Security, etc).
    const headers = new Headers();
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) headers.set('retry-after', retryAfter);
    const rateLimits = upstream.headers.get('x-sentry-rate-limits');
    if (rateLimits) headers.set('x-sentry-rate-limits', rateLimits);
    return new Response(null, { status: upstream.status, headers });
  } catch (error) {
    // Distinct from the forward failure above: the request to Sentry
    // already succeeded, so this is a fault in this project's own response
    // assembly, not a Sentry-reachability problem — the runbook needs to
    // tell the two apart.
    logger.error('Monitoring tunnel failed to assemble the forwarded response', {
      operation: MONITORING_TUNNEL_OPERATION,
      status: 'failed',
      errorCode: errorClass(error),
    });
    return new Response(null, { status: 502 });
  }
}
