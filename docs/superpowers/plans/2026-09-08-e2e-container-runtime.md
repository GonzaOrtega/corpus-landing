# E2E Container Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Playwright suite one defined runtime — the same image locally and in CI — running against a local Postgres, so browser availability and rendering stop depending on the host machine.

**Architecture:** A repo-owned image (`FROM mcr.microsoft.com/playwright:v1.63.0-noble` plus bun) builds, serves and tests the app in one runtime. Compose uses it locally; CI uses it as a job-level `container:` with `db` and `proxy` as service containers. E2E talks to `postgres:17` through a Neon HTTP proxy, so the production `drizzle-orm/neon-http` driver is unchanged; the endpoint override lives only in `tests/e2e/support/`.

**Tech Stack:** Docker Compose, `mcr.microsoft.com/playwright:v1.63.0-noble`, `postgres:17`, `ghcr.io/timowilhelm/local-neon-http-proxy`, bun 1.3.13, Playwright 1.63.0, Drizzle, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-08-e2e-container-runtime-design.md`

## Global Constraints

- **bun only.** Never `npm`, `yarn` or `pnpm` in scripts, Dockerfiles or workflows. `bunx` is fine. Inside the Playwright image, invoke Playwright as `bunx playwright` once bun is installed.
- **Production code is untouched.** No task may modify `src/adapters/db/**`, `src/composition/**`, `src/config/**`, `app/**` or `next.config.ts`. If a task appears to need one, stop and report.
- **Playwright image tag must equal the `@playwright/test` version.** Currently `1.63.0` → `mcr.microsoft.com/playwright:v1.63.0-noble`. Task 6 enforces this with a test.
- **Proxy is digest-pinned:** `ghcr.io/timowilhelm/local-neon-http-proxy@sha256:cd2ae14edf2feafbc3330492de5c80506f77274c3bd013154cdef697bdeb768a` (resolved from `:main`, 2026-09-08). `compose-image-pinned` accepts digests (`checks-compose.test.ts:233`).
- **Compose must satisfy `stack:check`:** top-level `name:`, Postgres published only to `127.0.0.1`, every image pinned, no git-tracked env file in `env_file:`, no `WATCHPACK_POLLING`, healthchecks on `db` and `proxy`.
- **Dev database credentials are local-only and appear in plaintext in `compose.yaml`.** They must never be real. The repo becomes public.
- **`bun run check` and `bun run test` must pass before every commit.**

---

## File Structure

| File | Responsibility |
|---|---|
| `compose.yaml` (create, root) | `db`, `proxy`, and a profiled one-shot `e2e` service |
| `docker/e2e.Dockerfile` (create) | The repo-owned runtime: Playwright image + bun |
| `tests/e2e/support/neon-local-endpoint.mjs` (create) | Sets `neonConfig.fetchEndpoint`; the only place the override exists |
| `tests/unit/e2e-runtime-config.test.ts` (create) | Asserts image tag ↔ `package.json`, digest pin, loopback bind |
| `playwright.config.ts` (modify) | Loads the override in both processes when the endpoint is set |
| `package.json` (modify) | `e2e:local` script |
| `.github/workflows/e2e-image.yml` (create) | Builds and publishes the runtime image to GHCR |
| `.github/workflows/preview.yml` (modify, job `e2e` at lines 156-218) | Runs in the published image with `db`/`proxy` services |
| `docs/operations/preview-ci.md` (modify) | Documents the two ways to run E2E |

Two processes need the override: the **app server** (started by `webServer`, reached via `NODE_OPTIONS`) and the **Playwright process itself** (`manage-early-access.spec.ts:12` builds its own `neon()` client). Task 3 covers both.

---

### Task 1: Prove the proxy round-trips

The spec records v1.x protocol compatibility as *inference, not documentation*. Nothing else is worth building until a query actually returns rows.

**Files:**
- Create: `compose.yaml`
- Create: `tests/e2e/support/neon-local-endpoint.mjs`

**Interfaces:**
- Produces: `compose.yaml` services `db` (Postgres on `127.0.0.1:55432`) and `proxy` (HTTP on `127.0.0.1:4444`); env var `E2E_NEON_HTTP_ENDPOINT` naming the proxy's `/sql` URL.

- [ ] **Step 1: Write `compose.yaml`**

```yaml
# E2E runtime only. `bun run dev` against Neon remains the everyday path — see
# docs/superpowers/specs/2026-09-08-e2e-container-runtime-design.md.
#
# name: is pinned so volume names never depend on the directory name; renaming
# the folder would otherwise orphan the data.
name: corpus-landing

services:
  # Credentials are deliberately worthless: this database holds only synthetic
  # e2e-<uuid>@example.com rows, and the repo becomes public.
  db:
    image: postgres:17
    ports:
      # Loopback only. Docker publishes ports by writing DNAT rules into
      # iptables' nat table, traversed before the filter table where ufw's
      # rules live — an unbound port answers the LAN whatever the host
      # firewall says.
      - '127.0.0.1:55432:5432'
    environment:
      POSTGRES_USER: corpus
      POSTGRES_PASSWORD: corpus
      POSTGRES_DB: corpus_landing
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U corpus -d corpus_landing']
      interval: 2s
      timeout: 3s
      retries: 15

  # Translates Neon's SQL-over-HTTP to plain Postgres so the app keeps using
  # drizzle-orm/neon-http exactly as production does. Digest-pinned: upstream
  # publishes only a moving :main tag.
  proxy:
    image: ghcr.io/timowilhelm/local-neon-http-proxy@sha256:cd2ae14edf2feafbc3330492de5c80506f77274c3bd013154cdef697bdeb768a
    environment:
      PG_CONNECTION_STRING: postgres://corpus:corpus@db:5432/corpus_landing
    ports:
      - '127.0.0.1:4444:4444'
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'nc -z localhost 4444 || exit 1']
      interval: 2s
      timeout: 3s
      retries: 15
```

No top-level `volumes:` block yet — the database is deliberately ephemeral for
E2E, and Task 2 adds the one volume that is actually used.

- [ ] **Step 1b: Confirm the proxy healthcheck can run**

The proxy image's contents are not documented, so `nc` may not exist:

```bash
docker compose up -d db proxy
sleep 5 && docker compose ps --format '{{.Service}} {{.Status}}'
```

Expected: `proxy` reaches `healthy`. If it shows `unhealthy` because `nc` is
missing, delete the `healthcheck:` block from `proxy` and add this comment in
its place:

```yaml
    # No healthcheck: the image ships no probe-capable binary. compose-healthcheck
    # is amber, not red, and `e2e` still gates on db being healthy.
```

Then have `e2e` depend on `proxy` with `condition: service_started` instead of
`service_healthy` in Task 2.

- [ ] **Step 2: Write the endpoint override**

Create `tests/e2e/support/neon-local-endpoint.mjs`:

```js
// The ONLY place the Neon HTTP endpoint is redirected. It lives under tests/
// on purpose: Next does not inline arbitrary server-side process.env reads, so
// an equivalent guard inside src/ would ship as live code in the production
// server bundle. Absence at build time beats any runtime check.
//
// Loaded two ways, because two processes issue queries:
//   - the app server, via NODE_OPTIONS=--import in playwright.config.ts
//   - the Playwright process, imported by playwright.config.ts itself
import { neonConfig } from '@neondatabase/serverless';

const endpoint = process.env.E2E_NEON_HTTP_ENDPOINT;
if (endpoint) {
  // fetchEndpoint is a module-level singleton: set once, it applies to every
  // subsequent neon() call in this process.
  neonConfig.fetchEndpoint = endpoint;
}
```

- [ ] **Step 3: Start the stack and apply migrations**

```bash
docker compose up -d db proxy
until docker compose exec -T db pg_isready -U corpus -d corpus_landing; do sleep 1; done
DATABASE_URL_UNPOOLED=postgres://corpus:corpus@127.0.0.1:55432/corpus_landing bun run db:migrate
```

Expected: migrations apply. `drizzle-kit` speaks the plain wire protocol and never touches the proxy.

- [ ] **Step 4: Prove a query round-trips through the proxy**

```bash
E2E_NEON_HTTP_ENDPOINT=http://localhost:4444/sql bun -e "
  await import('./tests/e2e/support/neon-local-endpoint.mjs');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon('postgres://corpus:corpus@localhost:55432/corpus_landing');
  console.log(await sql\`select count(*)::int as n from early_access_signups\`);
"
```

Expected: `[ { n: 0 } ]`.

**If this fails, stop and report.** It means the proxy does not speak the v1.x HTTP protocol, and the spec's chosen approach needs revisiting rather than patching.

- [ ] **Step 5: Verify the audit is satisfied**

Run: `bun run stack:check`
Expected: exit 0, no `compose-*` reds.

- [ ] **Step 6: Commit**

```bash
docker compose down -v
git add compose.yaml tests/e2e/support/neon-local-endpoint.mjs
git commit -m "feat(e2e): add a local Postgres and Neon HTTP proxy for E2E"
```

---

### Task 2: The repo-owned runtime image

**Files:**
- Create: `docker/e2e.Dockerfile`
- Modify: `compose.yaml`

**Interfaces:**
- Consumes: `compose.yaml` from Task 1.
- Produces: compose service `e2e` under `profiles: ['e2e']`, running as uid 1001.

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# The E2E runtime: Playwright's browsers and system dependencies (which the
# developer host lacks entirely for WebKit) plus bun, so one image builds,
# serves and tests the app. The tag MUST match @playwright/test in
# package.json — tests/unit/e2e-runtime-config.test.ts enforces it.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

# Playwright's own recommendation for CI is to run as a non-root uid so files
# written into the mounted workspace do not end up root-owned.
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.13" \
    && bun --version

WORKDIR /work
```

- [ ] **Step 2: Add the `e2e` service to `compose.yaml`**

Insert before the `volumes:` block:

```yaml
  # One-shot runner: no ports, exits when the suite finishes, so the standard's
  # long-running-service definition exempts it from a healthcheck. Profiled so
  # `docker compose up` never starts a test run.
  e2e:
    profiles: ['e2e']
    build:
      context: .
      dockerfile: docker/e2e.Dockerfile
    user: '1001'
    depends_on:
      db:
        condition: service_healthy
      proxy:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://corpus:corpus@db:5432/corpus_landing
      DATABASE_URL_UNPOOLED: postgres://corpus:corpus@db:5432/corpus_landing
      E2E_NEON_HTTP_ENDPOINT: http://proxy:4444/sql
      PORT: '3018'
      CI: 'true'
    volumes:
      - .:/work
      # Container-side node_modules: the host's may hold darwin or glibc-
      # mismatched binaries, and Playwright's browsers are Linux-only.
      - e2emodules:/work/node_modules
    command: sh -c "bun install --frozen-lockfile && bun run db:migrate && bun run e2e -- --grep-invert @preview"
```

Then add the top-level volumes block at the end of the file:

```yaml
volumes:
  e2emodules:
```

- [ ] **Step 3: Verify bun can write node_modules as uid 1001**

The spec flags this as untested; it decides whether dependencies are baked into the image or installed per run.

```bash
docker compose build e2e
docker compose run --rm --no-deps e2e sh -c "bun install --frozen-lockfile && echo INSTALL_OK"
```

Expected: `INSTALL_OK`. If it fails on permissions, add `RUN mkdir -p /work/node_modules && chown 1001:1001 /work/node_modules` to the Dockerfile and re-run.

- [ ] **Step 4: Verify the audit still passes**

Run: `bun run stack:check`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add docker/e2e.Dockerfile compose.yaml
git commit -m "feat(e2e): add the repo-owned Playwright and bun runtime image"
```

---

### Task 3: Wire the override into both processes

**Files:**
- Modify: `playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `tests/e2e/support/neon-local-endpoint.mjs`, `E2E_NEON_HTTP_ENDPOINT`.
- Produces: `bun run e2e` works unchanged against Neon; the override activates only when the endpoint variable is set.

- [ ] **Step 1: Import the override in the Playwright process**

At the top of `playwright.config.ts`, after the existing `nextEnv` import:

```ts
// manage-early-access.spec.ts builds its own neon() client inside this
// process, so the override has to be loaded here as well as in the app server.
// A no-op when E2E_NEON_HTTP_ENDPOINT is unset — which is how the Neon-backed
// run still works.
import './tests/e2e/support/neon-local-endpoint.mjs';
```

- [ ] **Step 2: Pass it to the app server**

In the `webServer` block, extend `env`:

```ts
        env: {
          PORT: '3018',
          ...(process.env.E2E_NEON_HTTP_ENDPOINT
            ? {
                E2E_NEON_HTTP_ENDPOINT: process.env.E2E_NEON_HTTP_ENDPOINT,
                NODE_OPTIONS: '--import ./tests/e2e/support/neon-local-endpoint.mjs',
              }
            : {}),
        },
```

- [ ] **Step 3: Add the local convenience script**

In `package.json` `scripts`:

```json
    "e2e:local": "docker compose run --rm e2e",
```

- [ ] **Step 4: Run the full suite in the container**

```bash
bun run e2e:local
```

Expected: every project passes, **including `webkit` and `mobile-safari`**, which cannot run on the host at all. This is the first end-to-end proof of the whole design.

- [ ] **Step 5: Confirm the Neon path is untouched**

```bash
bun run check && bun run test
```

Expected: both pass. `E2E_NEON_HTTP_ENDPOINT` is unset here, so the override is inert.

- [ ] **Step 6: Commit**

```bash
docker compose down -v
git add playwright.config.ts package.json
git commit -m "feat(e2e): load the local endpoint override in both test processes"
```

---

### Task 4: Publish the runtime image to GHCR

`jobs.<id>.container.image` needs a pullable reference; it cannot build inline.

**Files:**
- Create: `.github/workflows/e2e-image.yml`

**Interfaces:**
- Produces: `ghcr.io/gonzaortega/corpus-landing-e2e:v1.63.0-noble`.

- [ ] **Step 1: Write the workflow**

```yaml
name: E2E image

on:
  push:
    branches: [main]
    paths:
      - docker/e2e.Dockerfile
      - .github/workflows/e2e-image.yml
  workflow_dispatch:

permissions:
  contents: read
  packages: write

concurrency:
  group: e2e-image
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - id: version
        name: Derive the tag from the Playwright dependency
        shell: bash
        run: |
          set -euo pipefail
          # The tag tracks package.json so the image and the test runner can
          # never drift apart silently.
          v="$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/[^0-9.]/g,'')")"
          printf 'tag=v%s-noble\n' "$v" >> "$GITHUB_OUTPUT"
      - name: Log in to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin
      - name: Build and push
        env:
          TAG: ${{ steps.version.outputs.tag }}
        run: |
          set -euo pipefail
          image="ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/corpus-landing-e2e:${TAG}"
          docker build -f docker/e2e.Dockerfile -t "$image" .
          docker push "$image"
          printf 'Published `%s`\n' "$image" >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Publish the first image**

The `e2e` job cannot reference an image that does not exist yet, so publish before wiring Task 5.

```bash
gh workflow run "E2E image" --ref main
gh run watch "$(gh run list --workflow 'E2E image' --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: success, and the summary names the image.

- [ ] **Step 3: Make the package readable by Actions**

The published package defaults to private. In GitHub → Packages → `corpus-landing-e2e` → Package settings, confirm the repository has read access, or the `e2e` job cannot pull it.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/e2e-image.yml
git commit -m "ci: publish the E2E runtime image to GHCR"
```

---

### Task 5: Run the CI `e2e` job inside the image

**Files:**
- Modify: `.github/workflows/preview.yml` (job `e2e`, lines 156-218)

**Interfaces:**
- Consumes: the GHCR image from Task 4, `compose.yaml`'s service definitions as `services:`.

- [ ] **Step 1: Replace the job body**

Keep the job name `e2e` — it is a required check documented in `docs/operations/preview-ci.md`. Replace lines 156-218 with:

```yaml
  # Stable required PR check — do not rename. Runs in the same image developers
  # use locally, against the same Postgres and proxy, so a green run here means
  # the same thing as a green run on a laptop.
  e2e:
    name: e2e
    runs-on: ubuntu-latest
    timeout-minutes: 10
    container:
      image: ghcr.io/gonzaortega/corpus-landing-e2e:v1.63.0-noble
      # Playwright's documented recommendation: without it, files written into
      # the mounted workspace are root-owned and clash with the runner's uid.
      options: --user 1001
    services:
      db:
        image: postgres:17
        env:
          POSTGRES_USER: corpus
          POSTGRES_PASSWORD: corpus
          POSTGRES_DB: corpus_landing
        options: >-
          --health-cmd "pg_isready -U corpus -d corpus_landing"
          --health-interval 2s --health-timeout 3s --health-retries 15
      proxy:
        image: ghcr.io/timowilhelm/local-neon-http-proxy@sha256:cd2ae14edf2feafbc3330492de5c80506f77274c3bd013154cdef697bdeb768a
        env:
          PG_CONNECTION_STRING: postgres://corpus:corpus@db:5432/corpus_landing
    env:
      # Service containers are addressed by workflow label, not localhost, once
      # the job itself runs in a container.
      DATABASE_URL: postgres://corpus:corpus@db:5432/corpus_landing
      DATABASE_URL_UNPOOLED: postgres://corpus:corpus@db:5432/corpus_landing
      E2E_NEON_HTTP_ENDPOINT: http://proxy:4444/sql
      PORT: '3018'
    steps:
      - name: Fail closed for fork PRs
        if: ${{ github.event.pull_request.head.repo.full_name != github.repository }}
        run: |
          echo 'The required E2E check cannot run for a fork PR.' >&2
          exit 1
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}
      - name: Install dependencies
        if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}
        run: bun install --frozen-lockfile
      - name: Apply migrations to the E2E database
        if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}
        run: bun run db:migrate
      - name: Wait for the proxy
        # GitHub's `services:` has no health gate equivalent to compose's
        # depends_on for images without a probe, and the first query would
        # otherwise race the proxy's startup.
        if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}
        shell: bash
        run: |
          set -euo pipefail
          for i in $(seq 1 30); do
            if bun -e "await fetch('http://proxy:4444/sql',{method:'POST'}).catch(()=>{throw new Error()})" 2>/dev/null; then
              echo 'proxy reachable'; exit 0
            fi
            sleep 1
          done
          echo 'proxy never became reachable' >&2; exit 1
      - name: Run Playwright
        # No `playwright install` step: the browsers are in the image, which is
        # the point of the image.
        if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}
        run: bun run e2e -- --grep-invert @preview
```

Note the Neon branch steps are gone: `ci.yml`'s `test` job keeps Neon, where prod-shaped behaviour is what is being tested.

- [ ] **Step 2: Verify the workflow parses and keeps its guards**

```bash
python3 -c "
import yaml; d=yaml.safe_load(open('.github/workflows/preview.yml'))
e=d['jobs']['e2e']
assert e['name']=='e2e' and e['timeout-minutes']==10
assert 'corpus-landing-e2e' in e['container']['image']
assert set(e['services'])=={'db','proxy'}
print('e2e job OK')"
bun run test tests/unit/migration-workflow-config.test.ts
```

Expected: `e2e job OK`, and the workflow-config test still passes.

- [ ] **Step 3: Push and watch**

```bash
git add .github/workflows/preview.yml
git commit -m "ci: run e2e inside the shared runtime image"
git push
```

Expected: `e2e` green. **If it exceeds 3 minutes while failures accumulate, stop and report rather than iterating.**

---

### Task 6: Lock the image tag to the dependency

The image and `package.json` must never drift. `quiero-case-tn` solves this with a plain assertion over parsed YAML; mirror it.

**Files:**
- Create: `tests/unit/e2e-runtime-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

describe('E2E runtime configuration', () => {
  // A stale tag means the image ships browsers the runner does not expect, and
  // the failure surfaces as a confusing "browser not found" far from the cause.
  it('pins the Playwright image to the installed @playwright/test version', () => {
    const version = JSON.parse(read('package.json')).devDependencies['@playwright/test'];
    const expected = `v${version.replace(/[^0-9.]/g, '')}-noble`;

    expect(read('docker/e2e.Dockerfile')).toContain(`mcr.microsoft.com/playwright:${expected}`);
    expect(read('.github/workflows/preview.yml')).toContain(`corpus-landing-e2e:${expected}`);
  });

  it('pins the proxy by digest, since upstream publishes only a moving tag', () => {
    const digest = /local-neon-http-proxy@sha256:[0-9a-f]{64}/;
    expect(read('compose.yaml')).toMatch(digest);
    expect(read('.github/workflows/preview.yml')).toMatch(digest);
  });

  it('publishes Postgres only to loopback', () => {
    expect(read('compose.yaml')).toContain("'127.0.0.1:55432:5432'");
  });
});
```

- [ ] **Step 2: Run it**

Run: `bun run test tests/unit/e2e-runtime-config.test.ts`
Expected: PASS (Tasks 1-5 already satisfy it). If any assertion fails, the corresponding file drifted — fix the file, not the test.

- [ ] **Step 3: Prove the guard bites**

Temporarily change the Dockerfile tag to `v1.62.0-noble`, re-run, confirm FAIL, then restore. A guard never seen failing is not a guard.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/e2e-runtime-config.test.ts
git commit -m "test: lock the E2E image tag to the installed Playwright version"
```

---

### Task 7: Regenerate baselines in the image and document

The payoff: baselines become reproducible instead of host-shaped.

**Files:**
- Modify: `tests/e2e/landing-visual.spec.ts-snapshots/*.png`
- Modify: `docs/operations/preview-ci.md`

- [ ] **Step 1: Regenerate inside the image**

```bash
docker compose run --rm e2e sh -c "bun install --frozen-lockfile && bun run db:migrate && bun run e2e -- --update-snapshots --grep-invert @preview"
```

- [ ] **Step 2: Confirm CI agrees**

Push and confirm `e2e` is green — the same image produced the baselines and now compares against them. `email-rendering.spec.ts`, which previously passed on the runner and failed in the image, must now pass in both.

- [ ] **Step 3: Document both entry points**

In `docs/operations/preview-ci.md`, under "What runs where", add:

```markdown
E2E runs in a container image this repo owns (`docker/e2e.Dockerfile`),
published to GHCR and used identically by `bun run e2e:local` and by the CI
`e2e` job. That is why WebKit works locally despite the host lacking its system
libraries, and why screenshot baselines are comparable between a laptop and the
runner.

Regenerate visual baselines **inside the image**, never on the host:

    docker compose run --rm e2e sh -c "bun install --frozen-lockfile && bun run e2e -- --update-snapshots"

E2E uses a local Postgres reached through a Neon HTTP proxy, so the production
driver is unchanged and no Neon branch is consumed. `ci.yml`'s `test` job keeps
using Neon, where pooled-versus-unpooled behaviour is the thing under test.
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/landing-visual.spec.ts-snapshots docs/operations/preview-ci.md
git commit -m "test: regenerate visual baselines in the shared runtime image"
```

---

## Verification

1. `bun run check` and `bun run test` pass.
2. `bun run e2e:local` passes **including webkit and mobile-safari**.
3. CI `e2e` is green inside the container, under 3 minutes.
4. `bun run stack:check` reports no `compose-*` reds.
5. `git grep -n "E2E_NEON_HTTP_ENDPOINT" src app next.config.ts` returns nothing — the override never entered production code.

## Rollback

Every task is a standalone commit. Reverting Task 5 alone restores the previous host-runner `e2e` job; the compose stack and image remain usable locally. Nothing in Tasks 1-4 changes CI behaviour.
