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
| Monitoring tunnel rejections and forward faults | `Logger` port (`warn` for rejections, `error` for faults) | `app/monitoring/monitoring-route.handler.ts` |

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
want local events in Sentry (environment `development`). Neither test
command reports, for different reasons:

- `bun run test` runs Vitest, which never loads `instrumentation.ts`, so the
  SDK is never initialised; and Vitest sets `NODE_ENV=test`, which the
  pipeline signal (`runtime-environment.ts`) treats as a pipeline run, so
  every Sentry decision in the code under test resolves to "off".
- `bun run test:e2e` blanks the DSN and auth token in the build it runs and
  sets `CI`.

`bun run lighthouse`'s local (non-preview) run blanks them too and forces
the same pipeline signal for the server it starts, so the SERVER SDK stays
off and the `/monitoring` tunnel forwards nothing — but it never rebuilds.
If `.env.local` had a real DSN the last time you ran `bun run build`, that
DSN is already inlined into the client bundle it starts, and the browser SDK
still starts and captures (it has no way to see `CI`); its envelopes stop
at the tunnel. Run `bun run build` with `NEXT_PUBLIC_SENTRY_DSN` unset
before `bun run lighthouse` if you want the browser SDK off as well.

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

## Monitoring tunnel: observability and abuse protection

`/monitoring` (`app/monitoring/route.ts`, `monitoring-route.handler.ts`) is
public and unauthenticated by necessity — it's what the browser SDK posts
envelopes to. Two things follow from that.

**Rejections and faults are logged, successes are not.** Every 404 (DSN
configured but unusable — not a blank/unset DSN, which is routine), 403
(org/project mismatch or cross-site `Origin`) and 413 (oversized envelope)
logs a `warn` through the Logger port; a forward failure or a fault while
assembling the response to an already-successful forward each logs a
distinct `error`. Fields are the same spec §24 allowlist as everywhere else
(`operation`, `status`, `errorCode`) — never the envelope body, headers, or
DSN. `error`-level lines become Sentry issues via the Pino integration, so a
sustained run of forward failures pages the same way any other issue does; a
tunnel that starts silently rejecting is no longer indistinguishable from a
quiet week. A successful forward stays silent by design: logging the
high-volume path would recreate the exact per-event cost this design exists
to avoid.

**Residual risk: no rate limit in code, and the mitigation is partial.** A
serverless function has no shared memory for a correct in-process limiter,
and a database-backed one would put write load on Neon for exactly the flood
it is trying to absorb — both worse than the problem. The handler instead
rejects a POST whose `Origin` header names a different site, verified against
the vendored `@sentry/browser` fetch transport: it never sets `mode:
'no-cors'` and never touches `Origin`, so a legitimate same-origin post
always carries a matching one, and a page's own script cannot spoof or
suppress the header the browser attaches for a cross-site POST. This stops a
hostile *webpage* from turning visitors' browsers into an amplifier. It does
**not** stop a direct scripted flood (curl, a bot) that omits the `Origin`
header — allowed, by design, to avoid rejecting legitimate traffic that
omits it for any innocuous reason — or that simply sets `Origin` to this
site's own origin, which no server-side header check can tell apart from the
real thing. The `o`/`p` pair the tunnel also checks is not a secret: it ships
in the public bundle and in every envelope. Sentry's own project quotas cap
the worst case regardless.

The authoritative mitigation for volume is a Vercel Firewall rule, the same
mechanism `docs/operations/abuse-protection.md` already uses for the
early-access Server Actions — a blocked request there "does not reach the
application," which caps both forwarding cost and the log volume above.

| Setting | Value |
| --- | --- |
| Production host | this deployment's production host (see `abuse-protection.md`) |
| Methods | `POST` |
| Paths | `/monitoring` |
| Counter key | IP |
| Algorithm | Fixed window |
| Limit | start high (e.g. 60 requests per 60 seconds per region) and tighten from observed traffic — error/log bursts are legitimate after a bad deploy, unlike signup traffic |
| Follow-up | `Log` first, same rollout procedure as `abuse-protection.md` (§"Rollout and verification"), before switching to a `429` response |

**On Vercel Hobby, rate limiting allows only one rule per project.** If
`early-access-server-actions` already holds that slot, either add `/monitoring`
to its path list (methods and counter key already match; only the limit may
need to differ per path, which a single Hobby rule cannot express) or upgrade
before adding a second rule. This is an operator decision, not one this
change makes for you — record whichever way it goes in
`docs/operations/abuse-protection.md`.

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
