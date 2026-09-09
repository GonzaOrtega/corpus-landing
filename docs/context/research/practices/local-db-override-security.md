# Local-only Neon → local Postgres override — security assessment

checked-on: 2026-09-08
Stack observed: Next.js 16.3.4, `@neondatabase/serverless` ^1.1.0, drizzle-orm
^0.45.2, hexagonal composition, Vercel deploy, private-repo-going-public.

## Repo facts that shape the answer

- `src/adapters/db/neon-database.adapter.ts`: `createNeonDatabase(connectionString)`
  is a one-line `drizzle(neon(connectionString), {schema})`. It never touches
  `neonConfig` today.
- `src/composition/capabilities/persistence.ts` (`providePersistence`) is the
  *only* call site of `createNeonDatabase`, used by two composition roots:
  `composition/root.ts` (app) and `composition/ops/launch.wiring.ts` (launch
  email). Both consume `ServerConfig.databaseUrl` from `loadServerConfig
  (process.env)` in `config-secrets.ts` — the only `process.env` read for DB
  config in application code.
- `playwright.config.ts` runs E2E against a **production build** (`next build
  && next start`), both locally and in CI. `NODE_ENV=production` during E2E —
  a gate on `NODE_ENV !== 'production'` would be false during E2E too.
- CI already runs Playwright's E2E job (`.github/workflows/preview.yml`
  `e2e:`) against a **real disposable Neon branch**, same as Vitest
  integration (`ci.yml` `test:`). Nothing in CI touches a local Postgres
  container today — this escape hatch is a pure local-developer convenience,
  never something CI or Vercel needs to activate.
- `next.config.ts` already uses `VERCEL_ENV` presence/absence to distinguish
  "served by Vercel" from "local `next start`" (for CSP `upgrade-insecure-
  requests`) — the one existing "am I on Vercel" signal in this codebase.
- `.env.example` already reserves `DATABASE_URL_TEST`, unused by any `src/`
  code today — a separate name from `DATABASE_URL`.
- The existing integration test
  (`drizzle-early-access-signup.repository.integration.test.ts`) already
  reads `process.env.DATABASE_URL` directly and imports `createNeonDatabase`
  straight from `adapters/db`, bypassing composition/capabilities — precedent
  that test code constructing the adapter directly, outside the composition
  root, is already the norm here.

## Q1 — Threat model

1. **Runtime env-gate that fires when it shouldn't, on Vercel.** If the
   mechanism is "read an env var inside `src/`, mutate `neonConfig.
   fetchEndpoint` at runtime," safety depends entirely on that var never
   being truthy on Vercel. Credible accident paths: a Preview-scoped env var
   set for unrelated debugging and forgotten; a value copy-pasted from local
   `.env.local` into the Vercel dashboard (this repo's `.gitignore` already
   blanket-ignores `.env*` except `.env.example`, i.e. it already anticipates
   this class of near-miss for other secrets).
2. **Global mutable state, not per-request.** `neonConfig` is a module-level
   singleton in `@neondatabase/serverless`. Setting `fetchEndpoint` anywhere
   changes it for *every* `neon()` client built afterward in that process. In
   `next dev` (long-lived process) one forgotten local flag silently
   redirects all DB traffic for the rest of the session, not just
   E2E-tagged calls — a correctness footgun, not an external attack.
3. **Credential exfiltration via redirected endpoint** (config-driven, not
   classic SSRF): the Neon HTTP driver sends the connection string's
   credentials to whatever `fetchEndpoint` is configured. Dangerous only if a
   *real* `DATABASE_URL` and a *live* override coexist and the override
   target is not a fixed, repo-owned literal. If the target is a hardcoded
   `localhost` string in code never bundled into anything deployed, this
   collapses to "wrong endpoint, connection fails" — not credential leakage.
4. **Build-time bake-in is not automatic here.** Next.js does not inline
   arbitrary server-side `process.env.X` reads at build time (only
   `NEXT_PUBLIC_*` for client bundles, or vars explicitly listed in
   `next.config.ts`'s `env:{}`, which enables DefinePlugin substitution and
   thus dead-code elimination). A plain `if (process.env.FLAG)` guard ships
   as live source in the server bundle and is evaluated at request time by
   whichever process runs it — "the branch won't be in the bundle" is not
   true unless you either wire the flag through `next.config.ts`'s `env` key
   or keep the code out of the module graph entirely (see Q3).

## Q2 — Gating comparison

- **Absence of `VERCEL_ENV`**: weak alone. True on any non-Vercel host —
  teammate's laptop, self-hosted staging, misconfigured CI runner. Only means
  "not Vercel," not "opted into local Postgres."
- **Dedicated explicit opt-in var** + `!process.env.VERCEL_ENV`: better,
  needs two things true. Still a live runtime branch in the server bundle
  (Q1.4). Safety fully depends on `VERCEL_ENV` always being present on every
  Vercel deployment (documented as a system var Vercel auto-populates —
  [system-environment-variables]). Could not confirm from Vercel's docs
  whether the dashboard blocks a project from defining its own var literally
  named `VERCEL_ENV` — the only reserved-name list found
  ([reserved-environment-variables]) is AWS-Lambda-runtime names
  (`AWS_EXECUTION_ENV`, `TZ`, etc.), not `VERCEL_*`. Treat "VERCEL_ENV can't
  be overridden by a project" as **unconfirmed, not doc-backed**.
- **`NODE_ENV`**: unusable in this repo. E2E already runs `next build &&
  next start`, i.e. `NODE_ENV=production`, both locally and in CI
  (`preview.yml` e2e job). Gating on `NODE_ENV !== 'production'` disables the
  override during the exact suite it's meant to serve.
- **Build-time DCE via `next.config.ts`'s `env` passthrough**: possible in
  principle but not recommended — it requires naming the flag in
  `next.config.ts`, the CSP/security-header source of truth for this repo,
  and the DCE guarantee is a bundler implementation detail, not a documented
  contract.
- **Recommended — keep the override entirely out of `src/`.** Not a runtime
  gate at all: the mutation is never imported by anything `next build`
  traces, so it is structurally absent from the Vercel-deployed artifact
  regardless of any env var, and there is no env-var-driven code path for an
  accident to trigger.

## Q3 — Zero production-code-change: yes, recommended

- `neon-database.adapter.ts`, `persistence.ts`, `config-secrets.ts`,
  `server-env.ts`, `next.config.ts` — **unchanged**.
- New file lives under `tests/e2e/support/` (outside `src/`), e.g.
  `local-neon-proxy.preload.mjs`, that unconditionally sets `neonConfig.
  fetchEndpoint` to a hardcoded local literal. Load it only via Node's
  `--import`/`--require` (`NODE_OPTIONS=--import=./tests/e2e/support/local-
  neon-proxy.preload.mjs`) from a **new, local-only package.json script**
  (e.g. `e2e:local`), never through `playwright.config.ts`'s shared
  `webServer.env` block — that block is also what CI's `preview.yml` e2e job
  uses, unmodified, against a real Neon branch.
- `DATABASE_URL` for this mode is a fixed non-secret local literal (matches
  the reserved-but-unused `DATABASE_URL_TEST` naming already in
  `.env.example`), consumed only by the local wrapper script — never by
  `loadServerConfig`.
- Consistent with existing precedent: the integration test already imports
  `createNeonDatabase` and reads `process.env.DATABASE_URL` directly,
  bypassing composition/capabilities from test code.

## Q4 — Supply chain (local/CI test infra only)

Two materially different tools match "`fetchEndpoint` → local proxy →
Postgres":
- `neondatabase/neon_local` — **official** Neon image, but proxies to a
  *real* ephemeral Neon branch (needs `NEON_API_KEY`/`NEON_PROJECT_ID`), not
  fully offline. Reintroduces a live-credential requirement in local dev —
  arguably worse for "run against a Postgres container instead of Neon."
- `ghcr.io/timowilhelm/local-neon-http-proxy` — **third-party**, ~86 stars,
  CC0, no published checksums/signing — but the one that actually terminates
  at a **local Postgres container**, matching the stated goal.

Recommendations:
- Pin by **digest**, not `:latest`/`:main`, for both the proxy image and the
  paired `postgres:<major>.<minor>` image — floating tags are the most common
  source of silent drift, and for an unaudited third-party image also mean
  the pulled binary can change without review.
- Blast radius is small by construction if Q3's design is followed: the
  image only runs in local `docker compose`, is never reachable from the
  deployed app, never holds real Neon credentials, and has no code path into
  the production bundle. Don't publish its port beyond `localhost`.
- Given the low provenance of the third-party image, consider mirroring it
  into an org-controlled registry after one review pass rather than pulling
  from a stranger's `ghcr.io` namespace indefinitely.

## Q5 — Secrets/DB URLs in a docker-compose file in a repo going public

- Docker's own guidance: don't hardcode sensitive values in `docker-
  compose.yml`/`Dockerfile`; use `.env` (gitignored) or Compose `secrets:`
  (file-mounted) for anything real
  ([docker-compose-secrets], [docker-compose-env-best-practices]). This
  repo's `.gitignore` already enforces `.env*` blanket-ignore /
  `.env.example`-only, so the existing convention already covers real
  secrets correctly.
- For *this* compose file specifically the local Postgres credential is not
  secret at all — a fixed, throwaway dev value
  (`postgres:postgres@localhost:5432/...`) that only authenticates a
  container against itself on localhost. It is fine, and clearer for public
  readers, to hardcode that literal directly in the compose file rather than
  routing it through `.env` — it makes it visually obvious it isn't a real
  credential.
- What matters for the public-repo transition: keep this literal visually
  distinct from a real Neon connection string
  (`postgres://<user>:<password>@<ep-...>.<region>.aws.neon.tech/<db>
  ?sslmode=require`), and never let the same compose file also reference a
  real `NEON_API_KEY`/`DATABASE_URL` secret — keep the real-Neon path (CI
  secrets) and the local-only Postgres path (compose) structurally separate.

## Recommendation

Keep the override entirely out of `src/`: a Node `--import` preload script
under `tests/e2e/support/`, wired only through a new local-only
`package.json` script — never through `playwright.config.ts`'s shared
`webServer.env`, which CI's real-Neon-branch E2E job also consumes
unmodified. This gives true build-time absence from the Vercel-deployed
bundle rather than a runtime env-check that merely evaluates false today, and
requires zero changes to `neon-database.adapter.ts`, `persistence.ts`,
`server-env.ts`, or `next.config.ts` — matching the precedent already set by
the existing integration test.

## Sources

- Neon Local (official): https://neon.com/docs/local/neon-local ,
  https://github.com/neondatabase/neon_local
- Neon serverless driver local-dev guide:
  https://neon.com/guides/local-development-with-neon
- Third-party local Postgres proxy:
  https://github.com/TimoWilhelm/local-neon-http-proxy
- Vercel system env vars:
  https://vercel.com/docs/environment-variables/system-environment-variables
- Vercel reserved env vars (AWS-Lambda-runtime names only, not `VERCEL_*`):
  https://vercel.com/docs/environment-variables/reserved-environment-variables
- Docker Compose secrets:
  https://docs.docker.com/compose/how-tos/use-secrets/ ,
  https://docs.docker.com/compose/how-tos/environment-variables/best-practices/
- Repo: src/adapters/db/neon-database.adapter.ts,
  src/composition/capabilities/persistence.ts,
  src/composition/capabilities/config-secrets.ts, src/config/server-env.ts,
  next.config.ts, playwright.config.ts, .github/workflows/ci.yml,
  .github/workflows/preview.yml,
  src/adapters/db/drizzle-early-access-signup.repository.integration.test.ts,
  .env.example, .gitignore
