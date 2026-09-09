# A single E2E runtime, local and in CI

**Date:** 2026-09-08
**Status:** design proposed
**Scope:** how the Playwright suite is executed and what database it runs against
**Relates to:** claude-stack `docs/specs/2026-08-14-docker-dev-stack-design.md`
**Research:** `docs/context/research/docker-e2e-runtime.md`,
`docs/context/research/practices/local-db-override-security.md`

## Problem

Three failures this week were environment differences, not defects, and each
cost a CI round-trip to find:

1. **WebKit cannot run on the developer host at all** — Playwright reports
   `Host system is missing dependencies to run browsers`. A Safari-only failure
   in `homepage.spec.ts` was therefore only reproducible in CI. It turned out to
   be a CSP `upgrade-insecure-requests` directive that WebKit honours on
   localhost and Chromium exempts; diagnosing it required running WebKit
   locally, which was impossible until a container was used.
2. **A local environment file masked a real bug.** `legal-seo.spec.ts` passed on
   the host and failed in CI because the host supplied `PORT` and the runner did
   not, so the app was canonical for a port nothing served.
3. **Screenshot baselines are host-shaped.** `landing-visual.spec.ts-snapshots/`
   is named `-chromium-linux` but was generated on a laptop. It currently
   matches the GitHub runner by luck. `email-rendering.spec.ts` already
   disagrees: it passes on the runner and fails inside the Playwright image.

The common cause is that the suite has no defined runtime. It runs against
whatever browsers, fonts and ambient environment the machine happens to have.

## Why Docker here, when the portfolio standard says it is not required

claude-stack's docker-dev-stack spec sets the bar deliberately high:

> Docker is *required* only when something makes a cloud branch unsuitable: PII
> that must not leave the machine, genuine offline work, or a non-Postgres
> service with no hosted equivalent.

corpus-landing meets none of those three. Its database is Neon and its
clone-and-run story works. **The reason here is a fourth category that spec did
not encounter: a test runtime whose results depend on the host.** The same spec
explicitly permits this — "a repo may keep a Docker stack for any reason it
likes; what the standard governs is the *quality* of the stack once it exists"
— so this design adopts the standard's shape without claiming an exemption it
does not need.

The corollary matters: this is a **test** runtime, not a dev stack. `bun run
dev` against Neon stays the everyday path and is untouched.

## Decisions

1. **One repo-owned image, used locally and in CI.** `FROM
   mcr.microsoft.com/playwright:v1.63.0-noble` plus bun. The app and the tests
   execute in the same runtime, so rendering is identical by construction.
2. **E2E runs against a local Postgres**, not a Neon branch. The `test` job
   keeps Neon, where prod-shaped behaviour (pooled vs unpooled, PgBouncer) is
   the thing under test. E2E only ever writes synthetic
   `e2e-<uuid>@example.com` rows.
3. **The production driver is unchanged.** A local proxy translates Neon's
   SQL-over-HTTP to plain Postgres, so `neon-database.adapter.ts` keeps using
   `drizzle-orm/neon-http` exactly as production does.
4. **The endpoint override never enters `src/`.** It lives in test-harness code
   only.

## Shape

Root `compose.yaml`, per the standard:

| service | image | role |
|---|---|---|
| `db` | `postgres:17` | E2E database, published to `127.0.0.1` only |
| `proxy` | `ghcr.io/timowilhelm/local-neon-http-proxy@sha256:…` | Neon HTTP → Postgres |
| `e2e` | built from this repo's `Dockerfile` | builds, serves and tests the app |

`e2e` sits under `profiles: ['e2e']` so `docker compose up` does not start a
test runner. A profiled service may depend on unprofiled ones, which is the
direction `compose-profile-deps` permits.

There is no separate `app` service. `quiero-case-tn` splits app from runner
because its runner uses the stock image; here the repo-owned image contains bun,
so `playwright.config.ts`'s existing `webServer` block starts the app in-process
— the same code path a developer runs on the host today.

## The database override

`neonConfig.fetchEndpoint` is a module-level singleton in
`@neondatabase/serverless`, set once per process. It is set from a preload
module under `tests/e2e/support/`, injected into the app server via
`NODE_OPTIONS=--import …` from `playwright.config.ts`'s `webServer.env`.

Why not a flag inside `src/`: Next.js does **not** inline arbitrary server-side
`process.env` reads, so `if (process.env.LOCAL_DB) …` inside `src/` ships as
live code in the production server bundle. Absence at build time beats any
runtime check. `NODE_ENV` gating is also useless here — E2E runs a production
build, so `NODE_ENV` is `production` during tests too.

The result is that `neon-database.adapter.ts`, `persistence.ts`,
`config-secrets.ts`, `server-env.ts` and `next.config.ts` are all untouched.
This mirrors existing precedent: `manage-early-access.spec.ts` already imports
`neon` and reads `DATABASE_URL` directly from test code.

**Scope note, stated plainly:** the security research assumed CI would keep
Neon and concluded this override had no CI use case. Under this design it runs
in CI as well as locally. That widens where it is active from one context to
two; it does not widen production exposure, because the file is never imported
by anything the deployed server loads.

Migrations bypass the proxy entirely. `drizzle.config.ts` uses `dialect:
'postgresql'` with no driver override, so `drizzle-kit migrate` speaks the plain
wire protocol — `DATABASE_URL_UNPOOLED` points at Postgres `5432` directly,
never at the proxy's `4444`.

## CI

The `e2e` job runs inside the image via `jobs.e2e.container`, with `db` and
`proxy` as `services:`. Service containers are addressed by their workflow
label, not `localhost`, once the job itself is containerised.

- `bunx playwright install --with-deps` is deleted — browsers are baked in.
- `options: --user 1001`, Playwright's documented recommendation. This is the
  same class of problem as the root-owned `test-results/` encountered while
  prototyping.
- The Neon branch steps come out of `e2e`. `ci.yml`'s `test` job keeps them.

The proxy's documented host is `db.localtest.me` (public DNS → `127.0.0.1`),
which does not survive CI's private bridge — inside a job container
`127.0.0.1` is the job container itself, not the proxy. The preload therefore
reads its endpoint from a single variable (`E2E_NEON_HTTP_ENDPOINT`) rather than
hardcoding a hostname, so one module serves both sides: the published port
locally, the service label in CI. The alternative — a `--network-alias
db.localtest.me` on the service — was rejected as the more surprising of the
two, since it makes the code depend on DNS trivia rather than on a value the
workflow states outright.

## Snapshot baselines

Once both sides share an image, `landing-visual` and `email-rendering` baselines
become reproducible: regenerate them inside the image and both environments
agree. This is the payoff that makes the whole exercise worth it, and it is why
"local only" was rejected.

## Conformance

`stack:check` enforces the compose checks. This design satisfies them by
construction, with one conflict to resolve upstream:

**`compose-image-pinned` (red) requires "a concrete tag — not `:latest`, not
bare", and the proxy publishes only `:main`, a moving tag.** Resolved: the check
already accepts a digest pin — `checks-compose.test.ts:233`, *"accepts a digest
pin, which is stricter than a tag"*. No amendment upstream is needed. The proxy
is pinned at
`ghcr.io/timowilhelm/local-neon-http-proxy@sha256:cd2ae14edf2feafbc3330492de5c80506f77274c3bd013154cdef697bdeb768a`
(resolved from `:main`, 2026-09-08).

`db` publishes to `127.0.0.1` only (`compose-db-loopback`). `name:` is pinned
(`compose-name`). No `WATCHPACK_POLLING` (`compose-dead-polling`; this repo is
Next 16). No git-tracked env file appears in `env_file:` (`compose-env-tracked`).

`compose-healthcheck` and `compose-depends-healthy` apply to **long-running**
services, which the standard defines as publishing a port or being depended on
with a condition other than `service_completed_successfully`. That is `db` and
`proxy`; both get probes, and `e2e` reaches them through
`depends_on: { condition: service_healthy }`.

`e2e` itself needs no healthcheck: it publishes nothing and exits when the suite
finishes, which is exactly the one-shot runner the standard exempts. The app is
not a compose service at all — `playwright.config.ts`'s `webServer` starts it
inside the `e2e` container and Playwright's own readiness polling replaces the
probe.

## Open question

**How does CI obtain the image?** `jobs.<id>.container.image` requires a
pullable reference; it cannot build inline. Options, to settle in the plan:

- **Publish to GHCR** when the `Dockerfile` or the Playwright version changes,
  and reference the published tag. Fastest CI, one more workflow.
- **Build in the job** and `docker run` instead of `container:`. No registry, no
  extra workflow, but pays a build per run unless layer caching is configured —
  which the portfolio spec calls rarely worth it.

Recommendation: publish to GHCR, tagged with the Playwright version so the tag
and `package.json` cannot drift silently.

## Risks

- **The proxy is a third-party image with no versioning discipline** (last push
  2026-03-27). It is what Neon's own local-development guide recommends, it
  never sees real credentials, and it is confined to test infrastructure — but
  it must be digest-pinned and re-verified periodically.
- **v1.x protocol compatibility is inference, not documentation.** No HTTP
  wire-protocol change appears in `@neondatabase/serverless` v1.0/v1.1
  changelogs, but the proxy does not state v1 support. First implementation step
  is to prove a query round-trips.
- **`--user 1001` and `bun install` writing `node_modules` inside the same
  container is untested.** Verify early; it decides whether dependencies are
  baked into the image or installed per run.

## Out of scope

- The dev stack. `bun run dev` against Neon is unchanged.
- The `test` job and `ci.yml`. Neon stays where prod-shaped behaviour matters.
- Production image builds. Vercel builds and serves production.
- Adding corpus-landing to claude-stack's migration tracker, and any amendment
  to the portfolio standard's rationale. Worth doing; not this change.
