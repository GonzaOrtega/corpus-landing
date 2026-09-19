# Sentry: errors, traces, logs and the cron monitor

Design: `docs/superpowers/specs/2026-09-19-sentry-observability-design.md`.
This runbook is the procedure; the spec is the why.

## What is instrumented

| Surface | Mechanism | Where |
| --- | --- | --- |
| Uncaught server errors (RSC, route handlers, Server Actions, proxy) | `onRequestError` | `instrumentation.ts` |
| Server Action spans and trace continuation | `withServerActionInstrumentation` | `src/features/early-access/actions/*.action.ts` |
| Failures a boundary collapses into `retry` | `ErrorReporter` port → Sentry adapter | handlers under `src/features/early-access/actions/` |
| Use-case delivery failures and all operational log lines | Pino integration | `sentry.server.config.ts` |
| Maintenance cron check-ins and span | `withMonitor` + `startSpan` + `flush` | `app/api/cron/maintenance/route.ts` |
| Client render errors | error boundaries | `app/error.tsx`, `app/global-error.tsx` |
| Browser errors and console warn/error logs; page-load/navigation tracing when opted in | browser SDK, loaded after `load` | `instrumentation-client.ts`, `src/config/sentry-client.ts` |

Not instrumented: the Bun launch CLI (`scripts/launch-email.ts`). Its errors
are in the GitHub Actions job log.

## One-time setup

1. Create a Sentry project of type **Next.js**. Note the organisation slug,
   project slug and DSN.
2. Vercel project → Environment Variables (Production and Preview):
   - `NEXT_PUBLIC_SENTRY_DSN` — the DSN. Plain, not Sensitive: it is inlined
     into the browser bundle by design.
   - `SENTRY_ORG`, `SENTRY_PROJECT` — plain.
   - Optionally `SENTRY_TRACES_SAMPLE_RATE` (server tracing override) and
     `NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE` (browser tracing, off by
     default — see "Browser tracing" below).
   - **Do not** add `SENTRY_AUTH_TOKEN` to Vercel. The builds that deploy
     run `vercel build` in GitHub Actions, and a Vercel Sensitive variable
     pulls as the literal `[SENSITIVE]`, which the build treats as unset.
3. GitHub repository:
   - Actions **secret** `SENTRY_AUTH_TOKEN` — an organisation auth token with
     `project:releases` and `org:read` scopes.
   - Actions **variables** `SENTRY_ORG` and `SENTRY_PROJECT`.
   - The `vercel build` steps of `preview.yml` and `deploy-production.yml`
     must pass all three as step `env` (the production step also sets
     `SENTRY_RELEASE: ${{ inputs.sha }}`). Workflow files can only be changed
     by a credential with the `workflow` scope, so this is a separate,
     human-applied change; until it lands, deployed builds simply skip the
     upload and stack traces stay minified.
4. In Sentry, create alert rules (none are defined in code):
   - New issue in environment `vercel-production` → notify.
   - Cron monitor `early-access-maintenance` missed or failed → notify. The
     monitor is upserted by the first check-in with schedule `0 5 * * *` UTC,
     a 10-minute check-in margin and a 15-minute maximum runtime.

Local development: put `NEXT_PUBLIC_SENTRY_DSN` in `.env.local` only if you
want local events in Sentry (environment `development`). `bun run test`,
`bun run test:e2e` and `bun run lighthouse` never report regardless.

## Verifying a deployment

After the first Preview deploy with a DSN:

1. Open the site with the browser devtools Network tab. Envelope requests go
   to `/monitoring` on the site's own origin; nothing is requested from
   `*.sentry.io`. The CSP is unchanged.
2. Trigger a Server Action failure on the Preview (for example, point the
   Preview's `DATABASE_URL` at an unreachable host for one request) and check
   the resulting issue: tags `operation=join_early_access`, `release_stage`,
   `vercel_env=preview`; **no** email address, cookie, header, form field or
   connection string anywhere in the event. If any appears, that is a
   regression in `src/config/sentry-options.ts` — add the case to its test.
3. Sentry → Crons: `early-access-maintenance` shows a check-in after the next
   05:00 UTC run (or call the route with the bearer secret).
4. Sentry → Logs: the `Early-access maintenance completed` line appears with
   only `operation`, `status`, `aggregateCount` and `durationMs`.
5. Sentry → Releases: the Preview commit SHA has uploaded source maps, and a
   stack trace resolves to TypeScript source.

## Browser tracing

Page-load and navigation spans from the browser are off until
`NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE` is set. Measured on the
landing page they cost about two Lighthouse performance points against the
0.9 gate (the spec's decision 7 has the table). To enable them: set the
variable on Preview first, let the `lighthouse` PR check run against that
preview, and promote the setting to Production only if it stays green.
Server-side tracing (Server Actions, RSC renders, the cron, outgoing calls to
Neon, Resend and reCAPTCHA) is on regardless.

## What is never sent

Spec §24's list, enforced in `src/config/sentry-options.ts` and tested in
`src/config/sentry-options.test.ts`: email addresses (also redacted inside
free text), management tokens and hashes, CAPTCHA tokens and scores, provider
response bodies, connection strings and URL credentials, secrets, request
bodies, cookies, headers and user identity. Session Replay is not enabled.

## Turning it off

Remove `NEXT_PUBLIC_SENTRY_DSN` from the environment and redeploy. The SDK
initialises disabled, the tunnel route receives nothing, and the code paths
stay in place for the next deployment that sets it again.
