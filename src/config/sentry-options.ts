import type { ErrorEvent, Event, Log, SentryBuildOptions } from '@sentry/nextjs';
import { EARLY_ACCESS_LOG_FIELDS } from '../core/ports/logger.port';
import { isPipelineRun, type PipelineSignals } from './runtime-environment';

/**
 * Pure builders for every `Sentry.init` and `withSentryConfig` call in the
 * repository. Framework-facing files (`instrumentation*.ts`,
 * `sentry.*.config.ts`, `next.config.ts`) stay thin so this module carries
 * the decisions — and the tests — about what leaves the deployment.
 *
 * No `server-only` import: `instrumentation-client.ts` shares the scrubbers.
 * Inputs are typed to the exact variables each builder reads, because the
 * client can only see `NEXT_PUBLIC_*` values that are referenced literally at
 * the call site (Next.js inlines the member expression, not `process.env`).
 */

/** Vercel Preview builds pull "Sensitive" variables as this literal, never a value. */
const VERCEL_SENSITIVE_PLACEHOLDER = '[SENSITIVE]';

/** Blank, unset, and the Sensitive placeholder all mean "not configured". */
export const readSetting = (value: string | undefined): string | undefined =>
  value === undefined || value.length === 0 || value === VERCEL_SENSITIVE_PLACEHOLDER
    ? undefined
    : value;

/**
 * The one public-facing tunnel path; `proxy.ts` excludes it from negotiation.
 *
 * This project does **not** use the Sentry build plugin's `tunnelRoute`
 * option (R-04): that option makes the plugin install an unauthenticated
 * Next.js rewrite, on every build whether or not a DSN is configured, that
 * forwards to whichever org/project id the *caller* names in `?o=&p=` — a
 * free, unrate-limited forwarder on this domain. Instead, `app/monitoring
 * /route.ts` is a route handler this project owns: it validates `o`/`p`
 * against the org and project parsed from this deployment's own DSN
 * (`parseSentryDsn`) and forwards only to the ingest host derived from that
 * DSN. `buildClientSentryOptions` sets the browser SDK's `tunnel` option to
 * this same path directly, so nothing here depends on the build plugin's
 * value-injection step.
 */
export const SENTRY_TUNNEL_ROUTE = '/monitoring';

/**
 * Sentry SaaS ingest hosts only: `o<orgId>.ingest[.<region>].sentry.io`. This
 * deployment only ever uses Sentry SaaS (spec decision 5's same-origin
 * tunnel assumes it) — a DSN that doesn't match is treated as unconfigured,
 * the same as no DSN, rather than falling back to posting directly to a
 * third-party origin the CSP's `connect-src 'self'` does not allow (spec §22).
 */
const SENTRY_INGEST_HOST_PATTERN = /^o(\d+)\.ingest(?:\.([a-z]{2}))?\.sentry\.io$/;

export interface ParsedSentryDsn {
  readonly orgId: string;
  readonly projectId: string;
  readonly region?: string;
  readonly ingestHost: string;
}

/**
 * The one place `NEXT_PUBLIC_SENTRY_DSN` is parsed into the values the
 * `/monitoring` tunnel needs on both ends (R-04): the browser to address its
 * envelopes (`buildTunnelPath`), `app/monitoring/route.ts` to validate a
 * request and pick a forwarding destination (`buildIngestUrl`). Always reads
 * this deployment's own configured DSN — never anything caller-supplied.
 */
export function parseSentryDsn(rawDsn: string | undefined): ParsedSentryDsn | undefined {
  const dsn = readSetting(rawDsn);
  if (dsn === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return undefined;
  }
  const hostMatch = SENTRY_INGEST_HOST_PATTERN.exec(url.hostname);
  const projectId = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!hostMatch || projectId === '' || !/^\d+$/.test(projectId)) return undefined;
  const [, orgId, region] = hostMatch;
  return { orgId, projectId, region, ingestHost: url.hostname };
}

/**
 * `/monitoring?o=<orgId>&p=<projectId>[&r=<region>]` — the same query shape
 * the Sentry build plugin's own `tunnelRoute` option would have produced,
 * computed here instead from this deployment's own parsed DSN so the browser
 * and `app/monitoring/route.ts` (which checks the same two values) stay in
 * agreement without either trusting the other.
 */
export function buildTunnelPath(dsn: ParsedSentryDsn): string {
  const params = new URLSearchParams({ o: dsn.orgId, p: dsn.projectId });
  if (dsn.region) params.set('r', dsn.region);
  return `${SENTRY_TUNNEL_ROUTE}?${params.toString()}`;
}

/** The only forwarding destination `app/monitoring/route.ts` ever uses — built from this deployment's own parsed DSN, never from a request's query string. */
export function buildIngestUrl(dsn: ParsedSentryDsn): string {
  return `https://${dsn.ingestHost}/api/${dsn.projectId}/envelope/`;
}

const PRODUCTION_TRACES_SAMPLE_RATE = 0.1;
const NON_PRODUCTION_TRACES_SAMPLE_RATE = 1;

/** A number in [0, 1], or undefined for anything else (blank, NaN, out of range). */
export function parseSampleRate(raw: string | undefined): number | undefined {
  const setting = readSetting(raw);
  if (setting === undefined) return undefined;
  const parsed = Number(setting);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

/**
 * Server tracing is always on: an invalid override falls back to the
 * per-environment default rather than silently disabling tracing
 * (`Number('')` is 0) or sampling everything.
 */
export function resolveTracesSampleRate(
  raw: string | undefined,
  deploymentEnvironment: string | undefined,
): number {
  const fallback =
    deploymentEnvironment === 'production'
      ? PRODUCTION_TRACES_SAMPLE_RATE
      : NON_PRODUCTION_TRACES_SAMPLE_RATE;
  return parseSampleRate(raw) ?? fallback;
}

/**
 * Spec §24's never-log list, as key names. Any key matching this is removed
 * wherever it appears in an outgoing event or log, at any depth. Broad by
 * design: a false positive drops a harmless field; a false negative ships a
 * subscriber's address.
 */
const DENIED_KEY_PATTERN =
  /email|token|secret|password|passwd|cookie|authorization|captcha|form.?data|database.?url|connection.?string|response.?body|api.?key/i;

/**
 * Email addresses, `user:pass@` URL credentials (a Neon connection string
 * inside a driver error), and credential-bearing query parameters inside
 * free text. URL credentials go first so the address-shaped `pass@host`
 * remainder is not mistaken for an email.
 *
 * The query pattern is anchored on `^` as well as `[?&]`: the Sentry SDK
 * populates `request.query_string` as `URL.search.slice(1)` — no leading
 * `?` — so a bare string like `token=abc&x=1` needs the same first-pair
 * match a `?`-prefixed query would get (R-14).
 */
const URL_CREDENTIALS_PATTERN = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SENSITIVE_QUERY_PATTERN =
  /((?:^|[?&])(?:key|token|secret|api_key|apikey|access_token|password|email)=)[^&\s#'"]*/gi;
/**
 * URL fragments: this product's *only* credential — the raw management
 * token — travels in one (`managementUrl.hash` in
 * `send-confirmation-email.use-case.ts` and `launch-production.ts`), and a
 * leaked token is full access to that subscriber's record, since there are
 * no accounts or passwords (R-01). Broad by design, same as the key
 * denylist above: a false positive drops an inert `#anchor`, a false
 * negative ships a token.
 */
const URL_FRAGMENT_PATTERN = /#[^\s'"]+/g;

const MAX_DEPTH = 12;

export function redactText(value: string): string {
  return value
    .replace(URL_CREDENTIALS_PATTERN, '$1[credentials]@')
    .replace(EMAIL_PATTERN, '[email]')
    .replace(SENSITIVE_QUERY_PATTERN, '$1[redacted]')
    .replace(URL_FRAGMENT_PATTERN, '#[redacted]');
}

/**
 * Walks any JSON-shaped value: denied keys are dropped, strings are redacted,
 * everything else passes through. Cycles and very deep values stop at
 * MAX_DEPTH — the SDK normalises events to a fixed depth anyway.
 */
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return redactText(value) as T;
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (DENIED_KEY_PATTERN.test(key)) continue;
    out[key] = scrubValue(entry, depth + 1);
  }
  return out as T;
}

const PINO_ALLOWED = new Set<string>(EARLY_ACCESS_LOG_FIELDS);

/**
 * Reduces a request URL to origin + pathname before it ever reaches
 * `scrubValue` (R-01/R-14). The browser SDK's HttpContext integration fills
 * `event.request.url` from `document.location.href` — fragment included —
 * and that fragment is the one place this product's raw management token
 * ever travels. Structurally dropping the query and fragment here is
 * stronger than trusting a regex to catch every shape one might take, and
 * neither carries diagnostic value for this site. Falls back to `redactText`
 * for a value `URL` cannot parse (a relative path, say) rather than letting
 * it through untouched.
 */
function reduceRequestUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return redactText(url);
  }
}

/**
 * Structural drops first — request bodies, cookies, headers, user identity —
 * then the generic walk. `contexts.pino` is what the Pino integration attaches
 * from a log line's fields; the adapter already allowlisted them, but the
 * integration also sees any other pino logger in the process, so the
 * allowlist is re-applied here rather than trusted.
 */
export function scrubEvent<E extends Event>(event: E): E {
  const { request, user: _user, ...rest } = event;
  const safeRequest = request
    ? {
        url: reduceRequestUrl(request.url),
        method: request.method,
        query_string: request.query_string,
      }
    : undefined;
  const contexts = rest.contexts ? { ...rest.contexts } : undefined;
  if (contexts?.pino && typeof contexts.pino === 'object') {
    contexts.pino = Object.fromEntries(
      Object.entries(contexts.pino).filter(([key]) => PINO_ALLOWED.has(key)),
    );
  }
  return scrubValue({
    ...rest,
    ...(contexts ? { contexts } : {}),
    ...(safeRequest ? { request: safeRequest } : {}),
  } as E);
}

export function scrubLog(log: Log): Log {
  return {
    ...log,
    message: typeof log.message === 'string' ? redactText(log.message) : log.message,
    ...(log.attributes ? { attributes: scrubValue(log.attributes) } : {}),
  };
}

/**
 * Framework control flow and browser noise that carry no signal. NEXT_*
 * digests are how the App Router implements redirect()/notFound(); the SDK
 * filters most of them already, listing them here is belt and braces.
 */
const IGNORED_ERRORS: Array<string | RegExp> = [
  /^NEXT_REDIRECT/,
  /^NEXT_NOT_FOUND/,
  /^NEXT_HTTP_ERROR_FALLBACK/,
  /ResizeObserver loop/,
  /^AbortError/,
  'The operation was aborted',
];

/** Everything the SDK would otherwise collect on its own, switched off. */
const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
};

export interface ClientSentryInput {
  NEXT_PUBLIC_SENTRY_DSN?: string;
  /** Browser tracing is opt-in (see buildClientSentryOptions); unset means off. */
  NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE?: string;
}

export interface ServerSentryInput extends PipelineSignals {
  NEXT_PUBLIC_SENTRY_DSN?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  VERCEL_ENV?: string;
  CORPUS_RELEASE_STAGE?: string;
}

function sharedOptions(dsn: string | undefined, tracesSampleRate: number | undefined) {
  return {
    dsn,
    tracesSampleRate,
    enableLogs: true,
    dataCollection: DATA_COLLECTION,
    ignoreErrors: IGNORED_ERRORS,
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    beforeSendTransaction: <E extends Event>(event: E) => scrubEvent(event),
    beforeSendLog: (log: Log) => scrubLog(log),
  };
}

/**
 * The browser cannot tell a pipeline build from a deployment, so the DSN is
 * the only switch: it is inlined at build time and every non-Vercel build
 * (compose, Playwright, Lighthouse) blanks it explicitly.
 *
 * Browser tracing is opt-in. Measured on the landing page with the SDK
 * deferred past `load` (Lighthouse mobile, median of 3, baseline 0.93):
 * errors + logs alone score 0.91–0.92; with page-load/navigation tracing
 * 0.88–0.90 against a 0.9 gate. Server-side tracing covers Server Actions,
 * RSC and the cron regardless; set the variable to trade the points for
 * browser spans.
 */
export function buildClientSentryOptions(env: ClientSentryInput) {
  const dsn = readSetting(env.NEXT_PUBLIC_SENTRY_DSN);
  const parsedDsn = parseSentryDsn(dsn);
  return {
    ...sharedOptions(dsn, parseSampleRate(env.NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE)),
    // A DSN that doesn't parse as Sentry SaaS (R-04) is treated as
    // unconfigured: without a tunnel path there is nothing for the SDK to
    // post envelopes to that the CSP's `connect-src 'self'` allows.
    enabled: parsedDsn !== undefined,
    sendClientReports: false,
    ...(parsedDsn ? { tunnel: buildTunnelPath(parsedDsn) } : {}),
  };
}

/**
 * Same on/off rule as `provideNotifications`: a pipeline run never reports,
 * however fully configured, because the E2E container can read a real DSN.
 * `release` and `environment` are left to the build plugin, which derives
 * them from the same commit it uploaded source maps for.
 */
export function buildServerSentryOptions(env: ServerSentryInput) {
  const dsn = readSetting(env.NEXT_PUBLIC_SENTRY_DSN);
  return {
    ...sharedOptions(dsn, resolveTracesSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, env.VERCEL_ENV)),
    enabled: dsn !== undefined && !isPipelineRun(env),
    initialScope: {
      tags: {
        release_stage: env.CORPUS_RELEASE_STAGE || 'early-access',
        vercel_env: env.VERCEL_ENV || 'local',
      },
    },
  };
}

export interface SentryBuildInput {
  SENTRY_ORG?: string;
  SENTRY_PROJECT?: string;
  SENTRY_AUTH_TOKEN?: string;
  VERCEL_ENV?: string;
  CI?: string;
}

/**
 * Source maps and releases are uploaded only from a Vercel build (the CLI
 * `vercel build` in the workflows sets VERCEL_ENV too) that carries a real
 * token — never from the E2E container or a laptop, which would create
 * releases for builds nothing deploys. Upload failures warn: a Sentry outage
 * must not block a production release.
 *
 * Deliberately does **not** set `tunnelRoute` (R-04): that option makes the
 * plugin install its own unauthenticated Next.js rewrite for `/monitoring`
 * on every build, whether or not a DSN is even configured, forwarding to
 * whatever org/project id a caller names in the query string. The tunnel is
 * instead `app/monitoring/route.ts`, a route handler this project owns —
 * see `SENTRY_TUNNEL_ROUTE`'s comment.
 */
export function buildSentryBuildOptions(env: SentryBuildInput): SentryBuildOptions {
  const authToken = readSetting(env.SENTRY_AUTH_TOKEN);
  const uploads = env.VERCEL_ENV !== undefined && authToken !== undefined;
  return {
    org: readSetting(env.SENTRY_ORG),
    project: readSetting(env.SENTRY_PROJECT),
    authToken: uploads ? authToken : undefined,
    sourcemaps: { disable: !uploads, deleteSourcemapsAfterUpload: true },
    release: { create: uploads, finalize: uploads },
    telemetry: false,
    silent: env.CI === undefined,
    errorHandler: (error: Error) => {
      console.warn(`Sentry build step failed; continuing without it: ${error.message}`);
    },
  };
}
