# E2E runtime: local Neon proxy + GitHub Actions container

checked-on: 2026-09-08

Versions observed in repo (`package.json`):
- `@neondatabase/serverless`: `^1.1.0`
- `drizzle-orm`: `^0.45.2`, `drizzle-kit`: `^0.31.10`
- `@playwright/test`: `^1.63.0`
- Adapter: `src/adapters/db/neon-database.adapter.ts` — `neon(connectionString)` + `drizzle-orm/neon-http`, HTTP mode only (no WebSocket/Pool).
- `drizzle.config.ts` — `dialect: 'postgresql'`, no `driver` set, `dbCredentials.url = DATABASE_URL_UNPOOLED`. CI (`.github/workflows/ci.yml`) currently provisions a real disposable Neon branch per run (`neondatabase/create-branch-action`) — no local-Postgres path exists yet anywhere in the repo.

## 1. Local-Postgres options for `@neondatabase/serverless` v1.x

**`neondatabase/neon_local`** — REQUIRES a live Neon account. `NEON_API_KEY` and `NEON_PROJECT_ID` are both required env vars; it proxies to Neon's cloud control plane to create/route to a branch. No offline/standalone mode ships today — Neon has only floated an "offline mode" (dump/restore locally) as a future idea, not shipped. **The prior spec's claim is confirmed correct** — do not use `neon_local` for a hermetic/offline E2E run. (Sources: neon.com/docs/local/neon-local, github.com/neondatabase/neon_local)

**`ghcr.io/timowilhelm/local-neon-http-proxy`** — community tool, and it is Neon's own docs guide (`neon.com/guides/local-development-with-neon`) that points to it as *the* local-dev option for the serverless driver. Still exists, still gets patched (last push 2026-03-27; an SSL-cert-expiry issue was fixed on that date; 3 open issues, none blocking). **No semver tags/releases** — only the `main` tag (plus two odd `release-*` tags not meant for pinning). This is the main risk for "same pinned image locally and in CI": you can't pin an immutable version number, only `:main` (or a specific commit SHA digest, which is the closest thing to a pin — `ghcr.io/timowilhelm/local-neon-http-proxy@sha256:...`). Nothing in its changelog/issues suggests a protocol break with v1.x — and `@neondatabase/serverless` v1.0.0/v1.1.0 changelogs show no HTTP-protocol changes (v1.0.0 changed the JS call-site API for `sql`, not the wire protocol; v1.1.0 was type-only). Treat "supports v1.x" as **inference**, not doc-confirmed, but low-risk given no protocol churn.

**No other current documented option** turned up (no official Neon "testcontainers" style local emulator as of this check).

## 2. Client config for HTTP mode against the proxy

Documented pattern (proxy README + Neon's own local-dev guide):

```js
neonConfig.fetchEndpoint = (host) => {
  const [protocol, port] = host === 'db.localtest.me' ? ['http', 4444] : ['https', 443];
  return `${protocol}://${host}:${port}/sql`;
};
```

- Only `fetchEndpoint` is required for the HTTP (non-pooled, non-WebSocket) path this repo uses. `useSecureWebSocket` and `wsProxy` only matter for the WebSocket/`Pool` client — irrelevant to `drizzle-orm/neon-http` + plain `neon()`, which this adapter uses exclusively. Don't add them.
- Proxy listens at `http://db.localtest.me:4444/sql`; `localtest.me` is a public wildcard DNS → `127.0.0.1` (no `/etc/hosts` edit needed locally, matching how this monorepo already uses `lvh.me`).
- Proxy env var: `PG_CONNECTION_STRING=postgres://<user>:<pass>@<pg-host>:5432/<db>` pointed at the plain Postgres container.

**Gotcha (inference, not documented anywhere combining these two facts):** `db.localtest.me` resolves to `127.0.0.1` via public DNS — fine on a laptop with Docker port-published services, but *inside a GitHub Actions job container* the job talks to service containers over a private Docker bridge by service **label**, and `127.0.0.1` there is the job container itself, not the proxy service. Two ways to reconcile without forking the `neonConfig.fetchEndpoint` logic between local/CI:
  - Give the proxy service an explicit `--network-alias db.localtest.me` in the GH Actions `services:` `options:` (documented `docker run` flag, works because job-container + service containers share a user-defined bridge — see §4), and give it the same alias via Compose `networks.<net>.aliases` locally.
  - Or branch `fetchEndpoint` on an env var instead of a hardcoded hostname string (simpler, more explicit).

## 3. `drizzle-kit migrate` and the proxy

Bypasses it entirely — by design, and already true of this repo's config. `dialect: 'postgresql'` with no `driver` override uses drizzle-kit's own generic Postgres wire-protocol client, unrelated to `@neondatabase/serverless`/HTTP. `DATABASE_URL_UNPOOLED` should point straight at the Postgres container's `5432`, not the proxy's `4444`. This matches the existing prod split (unpooled URL for the session-locking migrator) — no config change needed, just point it at local Postgres instead of Neon's unpooled endpoint.

## 4. GitHub Actions job-level `container:`

- Syntax: `jobs.<id>.container: { image, credentials, env, ports, volumes, options }`. `options` maps to `docker create` flags; `--network` and `--entrypoint` are explicitly unsupported there.
- **Service addressing**: when the job itself runs in a `container:`, the job container and all `services:` containers are attached to the same Docker user-defined bridge network automatically. Address a service by its **workflow label** (e.g. `postgres`, `neon-proxy`), not `localhost`, and you don't need `ports:` mappings (those are only needed when the job runs directly on the bare runner). (docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
- Extra DNS aliases for a service container: `services.<id>.options: --network-alias <name>` is a valid pass-through to `docker run`.
- `--with-deps` is **not needed** — the whole point of `mcr.microsoft.com/playwright:v1.63.0-noble` is that browsers + OS deps are preinstalled; running `playwright install --with-deps` again inside it is redundant.
- Confirmed current tag for this repo's pinned `@playwright/test` (`^1.63.0`): **`mcr.microsoft.com/playwright:v1.63.0-noble`** (Ubuntu 24.04/Noble base). Playwright's own CI doc example for job-container mode:
  ```yaml
  jobs:
    playwright:
      runs-on: ubuntu-latest
      container:
        image: mcr.microsoft.com/playwright:v1.63.0-noble
        options: --user 1001
      steps:
        - uses: actions/checkout@v6
        - uses: actions/setup-node@v6
        - run: npm ci
        - run: npx playwright test
  ```
  (playwright.dev/docs/ci)
- **Permissions**: `options: --user 1001` is Playwright's own documented recommendation — avoids root-owned files in the mounted `GITHUB_WORKSPACE` clashing with the runner's UID when checked-out files get written back (test artifacts, trace/video output). Must match `bun install`'s ability to write `node_modules` inside the same container — untested here, verify once the compose file exists.
- What breaks going from "install Playwright on bare `ubuntu-latest`" to "job container": any action step that shells out to tools assumed present on the bare runner image (e.g., some setup-* actions, `docker` CLI itself — Docker-in-Docker is not available by default inside a job container) will fail; `actions/checkout` and `actions/setup-node`/`setup-bun` work fine since they're plain Node/binary installs.

## 5. 2026 status / deprecations

- Nothing deprecated found for either topic since the repo's pinned versions. `neon_local`'s only roadmap item (unshipped) is an offline mode — worth re-checking in a future pass, but not usable today.
- `local-neon-http-proxy` has no versioning discipline — re-verify it hasn't gone stale (check `pushed_at`) before long-term reliance; pin by digest if reproducibility matters more than getting upstream fixes.

## Sources
- https://github.com/neondatabase/neon_local (README)
- https://neon.com/docs/local/neon-local
- https://neon.com/guides/local-development-with-neon
- https://github.com/TimoWilhelm/local-neon-http-proxy (README, issues, releases)
- https://raw.githubusercontent.com/neondatabase/serverless/main/CHANGELOG.md
- https://orm.drizzle.team/docs/kit-overview, https://orm.drizzle.team/docs/drizzle-config-file
- https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers
- https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container
- https://playwright.dev/docs/ci, https://playwright.dev/docs/docker
