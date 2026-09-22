# Application observability with Sentry

**Date:** 2026-09-19
**Status:** design proposed
**Scope:** error reporting, distributed tracing, structured logs and cron
monitoring for the public site, its Server Actions and the maintenance cron
**Relates to:** `docs/superpowers/specs/2026-09-06-corpus-landing-design.md`
(the approved design spec). **This document amends it**: it supersedes the
"No Sentry in v1" line in §24 and the "Sentry" entry in the §36 "No" list, and
reinterprets nothing else. §24's never-log list and §25's exclusion of session
replay and behavioural analytics remain in force and are restated below as
obligations on the integration.

## Problem

The v1 spec deferred error tracking. In production that left three blind
spots:

- Every Server Action collapses failure into a generic `retry` state on
  purpose (§24), so a database outage, a Resend rejection and a CAPTCHA refusal
  were indistinguishable from the outside — and invisible from the inside,
  because the `catch` blocks discarded the error.
- The maintenance cron (§10.3) fails to a bare 500 that nobody is paged for,
  and a run that never starts is not detected at all.
- The Pino logger emits allowlisted operational lines that no system collects.

## Decisions

### 1. Sentry, with the SDK's Next.js integration, and nothing client-side beyond errors, traces and logs

`@sentry/nextjs` is added as the one observability dependency. Session Replay,
the feedback widget and any behavioural instrumentation stay out (§25). The
browser SDK captures unhandled errors and console warnings/errors as logs;
browser tracing (page load, navigation, same-origin requests) is available
but opt-in — see decision 7.

### 2. The never-log list is enforced by the SDK configuration, not by convention

§24's list — email, normalised email, raw management token, token hash,
CAPTCHA token, CAPTCHA score, Resend response body, database connection
string, secrets, full request form data — is enforced three times over:

1. `dataCollection` switches off every automatic source: user identity,
   cookies, request/response headers and bodies, query parameters, database
   query data and stack-frame local variables.
2. `beforeSend`, `beforeSendTransaction` and `beforeSendLog` drop request
   bodies, cookies, headers and user fields structurally, then walk the whole
   payload removing keys matching the list and redacting email addresses,
   URL credentials and credential-bearing query parameters inside any string.
   The Pino context is re-filtered against the logger allowlist rather than
   trusted.
3. Server Actions are instrumented without `formData` and without the
   response; the boundary reporter forwards only the Logger port's scalar
   allowlist as tags.

`src/config/sentry-options.test.ts` asserts all of this against the same
forbidden values `pino-logger.adapter.test.ts` uses.

### 3. Boundaries report through a port; use cases stay unaware

A new core port, `ErrorReporter`, is injected into the Server Action handlers.
They report the error they are about to collapse, with an operation name, and
then return the same public state as before — a rejected CAPTCHA and a closed
signup are not reported, because they are the system working. `core` never
imports the SDK; `SentryErrorReporterAdapter` and `NoopErrorReporterAdapter`
are constructed only in `src/composition/capabilities/observability.ts`.

Use-case-level delivery failures are already logged at `error` level through
the Logger port. The Sentry Pino integration turns those lines into handled
issues and every level into a log, so the use cases change nothing.

### 4. Turbopack means explicit instrumentation

Next 16 builds with Turbopack, where the SDK performs no build-time wrapping.
Therefore: each Server Action is wrapped in
`withServerActionInstrumentation`; the cron route wraps its authorised run in
a Sentry cron monitor (`early-access-maintenance`, schedule asserted equal to
`vercel.json`) and a span, and flushes before returning; `onRequestError`
captures everything uncaught on the server; `app/error.tsx` and
`app/global-error.tsx` capture client render errors.

### 5. Same-origin tunnel, no CSP change

Browser envelopes go to `/monitoring` on the site's own origin and are
forwarded server-side. §22's CSP stays at `connect-src 'self'`; no third-party
origin is added and `proxy.ts` leaves the path alone.

### 6. Pipeline never reports; non-Vercel builds never upload

The server SDK is enabled only with a DSN **and** outside a pipeline run
(`CI`, `NODE_ENV=test`, `E2E_NEON_HTTP_ENDPOINT` — the same signals §34 uses
for email). The browser cannot see those signals, so every local production
build (compose, Playwright, Lighthouse) blanks the DSN explicitly. Source
maps and releases are uploaded only from a build with `VERCEL_ENV` set and a
real auth token, and an upload failure is a warning, never a failed build.

### 7. Sampling, environments and releases — and the Lighthouse budget

Server traces: 10% in Production, 100% elsewhere, overridable through
`SENTRY_TRACES_SAMPLE_RATE`. Errors and logs: unsampled. Environment and
release come from the build plugin (`vercel-production`, `vercel-preview`;
the commit SHA), so an issue always resolves against the source maps of the
build that produced it. Events carry `release_stage` and `vercel_env` tags.

The browser SDK is loaded after the page's `load` event through a
tree-shaken module (`src/config/sentry-client.ts`), not before hydration.
Measured on the landing page (Lighthouse mobile, median of three runs,
baseline 0.93 against the 0.9 gate of §31):

| Variant | Performance | Total blocking time |
| --- | --- | --- |
| Baseline, no SDK | 0.93 | ~90 ms |
| SDK eager, before hydration | 0.89–0.92 | 120–200 ms |
| SDK deferred, errors + logs only | 0.91–0.92 | 130–160 ms |
| SDK deferred, with browser tracing | 0.88–0.90 | 200–220 ms |

Browser tracing is therefore **off unless `NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE`
is set**. Server-side tracing already covers every Server Action, RSC render,
cron run and outgoing call; enabling browser spans is a deliberate trade of
those points, made per deployment and checked by the preview Lighthouse job.

### 8. Out of scope, deliberately

- The Bun launch CLI (`scripts/launch-email.ts`) is not instrumented. It is a
  one-off, human-gated process with its own GitHub Actions log; adding a
  second SDK for one script is not worth its surface.
- No alerting rules are defined in code; the runbook describes the ones to
  create in Sentry.

## Consequences

- Sentry becomes a processor. The privacy page names it and states what is
  never sent (§26).
- `docs/architecture.md` gains an Observability adapter and the
  `ErrorReporter` port; that file is protected and is updated separately.
- New environment contract: `NEXT_PUBLIC_SENTRY_DSN`,
  `SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE`,
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (names in
  `.env.example`, procedure in `docs/operations/sentry.md`).
- The client bundle grows by about 52 KB gzipped, fetched after load; the
  Lighthouse performance gate (≥ 0.9 mobile) remains the arbiter.
