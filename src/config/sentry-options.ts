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
 * Sentry SaaS ingest hosts only: `o<orgId>.ingest[.<region>].sentry.io`, where
 * the region is a DNS label (`us`, `de`, and any newer, longer one). This
 * deployment only ever uses Sentry SaaS (spec decision 5's same-origin
 * tunnel assumes it) — a DSN that doesn't match is treated as unconfigured,
 * the same as no DSN, rather than falling back to posting directly to a
 * third-party origin the CSP's `connect-src 'self'` does not allow (spec §22).
 */
const SENTRY_INGEST_HOST_PATTERN =
  /^o(\d+)\.ingest(?:\.([a-z](?:[a-z0-9-]{0,30}[a-z0-9])?))?\.sentry\.io$/;

/**
 * Why a configured DSN will not be used, or undefined when there is nothing
 * to say (no DSN, or one that parses). The browser SDK treats an unparseable
 * DSN exactly like a missing one, so without this a typo would look the same
 * as Sentry never having been set up (R-30); `next.config.ts` prints it at
 * build time.
 */
export function describeDsnProblem(rawDsn: string | undefined): string | undefined {
  if (readSetting(rawDsn) === undefined || parseSentryDsn(rawDsn) !== undefined) return undefined;
  return 'NEXT_PUBLIC_SENTRY_DSN is set but is not a Sentry SaaS DSN (https://<key>@o<org>.ingest[.<region>].sentry.io/<project>); browser error reporting is disabled.';
}

/** Prints `describeDsnProblem`'s message, if any; the build-time hook in `next.config.ts`. */
export function warnOnDsnProblem(
  rawDsn: string | undefined,
  warn: (message: string) => void = console.warn,
): void {
  const problem = describeDsnProblem(rawDsn);
  if (problem !== undefined) warn(problem);
}

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
 * Database connection strings, `user:pass@` URL credentials, email addresses
 * and credential-bearing query parameters inside free text. A Postgres URL is
 * dropped whole — host and database name included — because spec §24 lists
 * the connection string itself, not just its password (R-25). URL credentials
 * go before emails so the address-shaped `pass@host` remainder is not
 * mistaken for an email.
 *
 * Every pattern that scans a character run from each start position has
 * that run bounded (R-41): an unbounded `[chars]+@` retries the whole run
 * from every position and turned a 40 KB line into seconds of work inside
 * the request that is reporting it. The bounds are real limits — a URL
 * scheme is at most 32 characters, an email local part at most 64 (RFC
 * 5321) — and a longer run still has its tail matched and redacted. No
 * lookbehind anchors: they would skip a match glued to a `-`, a digit or a
 * previous match (`-https://u:p@h`, `a@b.com-c@d.com`).
 *
 * The query pattern is anchored on `^` as well as `[?&]`: a bare string like
 * `token=abc&x=1` needs the same first-pair match a `?`-prefixed query would
 * get (R-14).
 */
const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s'"]+/gi;
const URL_CREDENTIALS_PATTERN = /([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@]+@/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SENSITIVE_QUERY_PATTERN =
  /((?:^|[?&])(?:key|token|secret|api_key|apikey|access_token|password|email)=)[^&\s#'"]*/gi;

/**
 * URL fragments: this product's *only* credential — the raw management
 * token — travels in one (`managementUrl.hash` in
 * `send-confirmation-email.use-case.ts` and `launch-production.ts`), and a
 * leaked token is full access to that subscriber's record, since there are
 * no accounts or passwords (R-01).
 *
 * Two rules, either of which redacts:
 * - a `#` that belongs to a URL or a path — one whose whitespace-delimited
 *   token has a `/` before it (`https://x/y#t`, `/early-access/manage#t`),
 *   whatever follows it;
 * - a `#` (or its encoding `%23`) followed by a token-shaped run of 20 or
 *   more base64url characters, wherever it appears. The token is
 *   `randomBytes(...).toString('base64url')`, and it also surfaces with no
 *   path in front: the bare `location.hash`, a `'#<token>' is not a valid
 *   selector` DOMException, a console line.
 *
 * Anything else is left alone, so a clicked `button#submit`, `Minified
 * React error #418` and `#fff` stay readable (R-32/R-42). The path rule is
 * applied per token rather than with one regex so the work stays linear in
 * the length of the text.
 */
const TEXT_TOKEN_PATTERN = /[^\s'"]+/g;
const TOKEN_SHAPED_FRAGMENT_PATTERN = /(#|%23)[A-Za-z0-9_-]{20,}/gi;

function redactUrlFragment(token: string): string {
  const hash = token.indexOf('#');
  if (hash === -1 || !token.slice(0, hash).includes('/')) return token;
  return `${token.slice(0, hash)}#[redacted]`;
}

/** An object or array this deep is replaced, never passed through unscrubbed (R-20). */
const MAX_DEPTH = 12;
const DEPTH_LIMIT_MARKER = '[depth-limit]';

export function redactText(value: string): string {
  return value
    .replace(DATABASE_URL_PATTERN, 'postgres://[redacted]')
    .replace(URL_CREDENTIALS_PATTERN, '$1[credentials]@')
    .replace(EMAIL_PATTERN, '[email]')
    .replace(SENSITIVE_QUERY_PATTERN, '$1[redacted]')
    .replace(TEXT_TOKEN_PATTERN, redactUrlFragment)
    .replace(TOKEN_SHAPED_FRAGMENT_PATTERN, '$1[redacted]');
}

/**
 * Walks any JSON-shaped value: denied keys are dropped, strings are redacted,
 * everything else passes through. Cycles and very deep values stop at
 * MAX_DEPTH, and fail closed: whatever sits below the limit is replaced by a
 * marker rather than shipped unwalked. The SDK normalises events to a much
 * shallower depth first, so a real event never reaches it.
 */
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return redactText(value) as T;
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return DEPTH_LIMIT_MARKER as T;
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
 * `event.request.url` from `document.location.href` — fragment included.
 * Structurally dropping the query and fragment here is stronger than
 * trusting a regex to catch every shape one might take, and neither carries
 * diagnostic value for this site. A value `URL` cannot parse (a relative
 * path, say) gets the same cut via `stripQueryAndFragment`.
 */
function reduceRequestUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return stripQueryAndFragment(url);
  }
}

function stripQueryAndFragment(url: string): string {
  return url.replace(/[?#][\s\S]*$/, '');
}

type Breadcrumbs = NonNullable<Event['breadcrumbs']>;
type ExceptionValues = NonNullable<NonNullable<Event['exception']>['values']>;

/**
 * The page URL is not the only field that can carry the management link
 * (R-43). The history instrumentation records the bridge's `replaceState`
 * as a `navigation` breadcrumb whose `from` is the relative URL, fragment
 * included; an error thrown from an inline script has the document URL as
 * its frame filename. Both are cut structurally here, the same way
 * `request.url` is, instead of relying on the text rule alone.
 */
function reduceBreadcrumbUrls(breadcrumbs: Breadcrumbs): Breadcrumbs {
  return breadcrumbs.map((crumb) => {
    if (crumb.category !== 'navigation' || !crumb.data) return crumb;
    const data = { ...crumb.data };
    for (const key of ['from', 'to'] as const) {
      if (typeof data[key] === 'string') data[key] = stripQueryAndFragment(data[key]);
    }
    return { ...crumb, data };
  });
}

function reduceFrameUrls(values: ExceptionValues): ExceptionValues {
  return values.map((value) => {
    const frames = value.stacktrace?.frames;
    if (!frames) return value;
    return {
      ...value,
      stacktrace: {
        ...value.stacktrace,
        frames: frames.map((frame) => ({
          ...frame,
          ...(frame.filename !== undefined
            ? { filename: stripQueryAndFragment(frame.filename) }
            : {}),
          ...(frame.abs_path !== undefined
            ? { abs_path: stripQueryAndFragment(frame.abs_path) }
            : {}),
        })),
      },
    };
  });
}

/**
 * Structural drops first — request bodies, cookies, headers, the query
 * string, user identity, and the query and fragment of every URL-carrying
 * field — then the generic walk. `contexts.pino` is what the Pino
 * integration attaches from a log line's fields; the adapter already
 * allowlisted them, but the integration also sees any other pino logger in
 * the process, so the allowlist is re-applied here rather than trusted.
 */
export function scrubEvent<E extends Event>(event: E): E {
  const { request, user: _user, ...rest } = event;
  const safeRequest = request
    ? { url: reduceRequestUrl(request.url), method: request.method }
    : undefined;
  const contexts = rest.contexts ? { ...rest.contexts } : undefined;
  if (contexts?.pino && typeof contexts.pino === 'object') {
    contexts.pino = Object.fromEntries(
      Object.entries(contexts.pino).filter(([key]) => PINO_ALLOWED.has(key)),
    );
  }
  const exceptionValues = rest.exception?.values;
  return scrubValue({
    ...rest,
    ...(contexts ? { contexts } : {}),
    ...(rest.breadcrumbs ? { breadcrumbs: reduceBreadcrumbUrls(rest.breadcrumbs) } : {}),
    ...(exceptionValues
      ? { exception: { ...rest.exception, values: reduceFrameUrls(exceptionValues) } }
      : {}),
    ...(safeRequest ? { request: safeRequest } : {}),
  } as E);
}

/** What the Pino integration stamps on every log record it forwards. */
const PINO_LOG_ORIGIN = 'auto.log.pino';

/**
 * The metadata the SDK and its Pino integration add to a log record
 * (`@sentry/core` logs/internal, `@sentry/node-core` integrations/pino).
 * Named one by one rather than by prefix: the integration spreads the log
 * line's own fields first, so a prefix would also admit a caller's field
 * that happens to be called `sentry.something`.
 */
const SDK_LOG_ATTRIBUTES = new Set([
  'sentry.origin',
  'sentry.environment',
  'sentry.release',
  'sentry.sdk.name',
  'sentry.sdk.version',
  'sentry.trace.parent_span_id',
  'pino.logger.level',
]);

/**
 * Pino records arrive with every field of the log line as an attribute, from
 * any pino logger in the process — not only the allowlisting adapter. As with
 * `contexts.pino`, they are re-filtered against the logger allowlist, keeping
 * only the SDK's own metadata besides (R-10). Console
 * logs keep the denylist walk: their `sentry.message.parameter.N`
 * attributes are the message itself.
 */
function allowlistPinoAttributes(attributes: NonNullable<Log['attributes']>) {
  if (attributes['sentry.origin'] !== PINO_LOG_ORIGIN) return attributes;
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([key]) => PINO_ALLOWED.has(key) || SDK_LOG_ATTRIBUTES.has(key),
    ),
  );
}

export function scrubLog(log: Log): Log {
  return {
    ...log,
    message: typeof log.message === 'string' ? redactText(log.message) : log.message,
    ...(log.attributes ? { attributes: scrubValue(allowlistPinoAttributes(log.attributes)) } : {}),
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
    // Standalone spans (browser web vitals) skip beforeSendTransaction (R-03).
    beforeSendSpan: <S extends object>(span: S) => scrubValue(span),
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
