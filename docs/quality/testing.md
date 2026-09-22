# Testing and coverage

How this repository tests itself, what each layer proves, and the coverage
gate that keeps that breadth from eroding. The design spec's acceptance
requirements (§27–§30, §39) are the contract; this page is the operating
manual for meeting them.

## Layers

| Layer | Where | What it proves | Doubles |
| --- | --- | --- | --- |
| Domain and use cases | `src/core/**/*.test.ts` | Every branch of the seven use cases and the entity, against the port contracts | `InMemoryEarlyAccessSignupRepository`, `FixedClockAdapter`, `DeterministicTokenAdapter`, `buildSignup`/`buildSignupProps` (`src/core/testing/`) |
| Repository contract | `src/core/testing/early-access-signup-repository.contract.ts` | One suite run unchanged against the in-memory double and the real Drizzle adapter, so both enforce §9.2 identically | — |
| Adapters | `src/adapters/**/*.test.ts` | Provider outcome mapping, PII-free diagnostics, hashing and token derivation, Drizzle error translation with a chainable stand-in | Recording senders/loggers, structural `Database` stub |
| Repository integration | `src/adapters/db/*.integration.test.ts` | The SQL, the partial unique index and the driver, against real Postgres | Disposable Neon branch in CI, passed as `DATABASE_URL_TEST`; skipped locally unless that variable points at a throwaway database |
| Composition and wiring | `src/composition/**/*.test.ts`, `src/features/**/*.wiring.test.ts` | Capability selection by environment, fail-closed production rules, and that each wiring file assembles a working object graph | `vi.stubEnv`; `vi.mock` of `capabilities/persistence` to inject the in-memory repository |
| Delivery: Server Actions, routes, pages, proxy | `src/features/**/actions/*.test.ts`, `app/**/*.test.ts(x)`, `proxy.test.ts` | Validation, error mapping, response shaping, metadata, and server-rendered markup via `renderToStaticMarkup` | `vi.mock` of wiring modules and Next-only modules (`next/font/*`, `next/og`, `next/script`) |
| Browser behaviour | `tests/e2e/*.spec.ts` (Playwright) | Motion, the Living Lexicon, signup and management journeys, axe, prototype parity | Local Postgres behind a Neon HTTP proxy, fake CAPTCHA and email |
| Configuration regressions | `tests/unit/*.test.ts` | Workflow, compose, Lighthouse and font-asset invariants | — |

There is deliberately no jsdom or testing-library layer. Server components are
asserted on their static markup; behaviour that only exists in effects or GSAP
timelines is asserted in the browser by Playwright.

## Commands

```bash
bun run test            # Vitest, no coverage (fast feedback)
bun run test:coverage   # Vitest with the coverage gate — also runs inside `check`
bun run test:e2e        # Containerized Playwright
bun run test:all        # check (coverage included) + test:e2e
```

`bun run test:coverage` writes `coverage/` (git-ignored): `index.html` for
browsing, `lcov.info`, `coverage-summary.json` and `coverage-summary.txt`. The
report contains source paths and hit counts only, never an environment value.
Nothing uploads it; read it locally.

The gate binds in two places. `bun run check` ends with it, so a breached
threshold fails before the push. The required CI `test` check runs it as well,
against a disposable Neon branch — that job is the only one with a database, so
it is the only place the Drizzle repository is measured instead of excluded.

`server-only` is aliased to `tests/setup/server-only.stub.ts` in
`vitest.config.ts`, mirroring the empty module Next resolves under its
`react-server` condition, so no test needs to mock it.

## Coverage gate

Provider: `@vitest/coverage-v8`, pinned to the exact Vitest version it peers
with (both at `5.0.0`; bump them together). Measured files: `src/**`, `app/**`,
`proxy.ts`, and the root production modules `instrumentation.ts`,
`instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
and `next.config.ts`. Thresholds are per glob and evaluated on every
`test:coverage` run; the build fails below any of them.

| Glob | Target | Enforced (lines / branches / functions / statements) |
| --- | --- | --- |
| `src/core/**` | 100 | 100 / 100 / 100 / 100 |
| `src/adapters/**` | 90 | 100 / 92 / 100 / 99 |
| `src/composition/**` | 90 | 98 / 100 / 93 / 98 |
| `src/config/**` | 90 | 99 / 97 / 100 / 98 |
| `src/ops/**` | 90 | 95 / 90 / 100 / 95 |
| `src/features/**` | 80 | 90 / 90 / 86 / 88 |
| `src/components/**` | 80 | 100 / 100 / 100 / 100 |
| `app/**` | 80 | 93 / 94 / 80 / 93 |
| `proxy.ts` | 80 | 100 / 97 / 100 / 100 |
| root modules (`instrumentation*.ts`, `sentry.*.config.ts`, `next.config.ts`) | 80 | 100 / 100 / 100 / 100 |
| anything else | 80 | 80 / 80 / 80 / 80 (an aggregate over unclaimed files, not a per-directory net; see below) |

Enforced values are `max(target, floor(measured))` as of the latest entry in
the threshold history below. The adapters row accounts for the Drizzle
repository, which is measured only where `DATABASE_URL_TEST` is set: its unit
suite alone leaves it at 100 / 85 / 100 / 98, the aggregate with that lower
bound is 100 / 92 / 100 / 99, and the CI `test` job measured it at
98 / 93 / 100 / 100 with the integration suite on top.

The "anything else" row is Vitest's global threshold, which averages every
file no glob claims. A brand-new `src/<dir>/` with no tests would be diluted by
the rest rather than caught, so the real net is
`tests/unit/coverage-thresholds.test.ts`: it fails `check` when a top-level
directory under `src/` has no glob of its own, when a root production module is
left out of the measured set, or when any glob is set below its layer's target.

### Ratchet rule

- A threshold only moves **up**. Raise it in the PR that raises coverage, to
  `floor(measured)` for that glob.
- A threshold is never lowered to make a PR green. Cover the new branch instead.
  Lowering one requires a documented decision in this file explaining why the
  code cannot be exercised.
- `coverage.thresholds.autoUpdate` stays off: it would rewrite
  `vitest.config.ts` on every local run and hide the decision in noise.
- `/* v8 ignore */` is not used. An unreachable defensive branch is either
  covered through a structural stub (see the resolve/unsubscribe and purge use
  case tests) or removed with a comment.

### Threshold history

Every change to an enforced value is recorded here, including the ones that
moved down.

- **2026-09-20** — gate introduced at 454 tests. Floors set from that
  measurement: core 100/100/100/100; adapters 100/92/100/99; composition
  98/100/93/98; config 100/100/100/100; ops 95/90/100/95; features
  88/89/87/87; components, app 100/100/100/100; proxy 100/97/100/100.
- **2026-09-22** — merged `main`, which brought the Sentry observability work
  inside the measured globs for the first time. Re-measured at 562 tests:
  config 100/100/100/100 → 99/97/100/98; features 88/89/87/87 → 88/89/86/87;
  app 100/100/100/100 → 93/94/80/93. Not a lowering to get green: the newly
  measured `app/error.tsx`, `app/global-error.tsx`, `app/monitoring/route.ts`
  and the Sentry configs were left measured rather than excluded, and every
  agreed target still holds. `app/error.tsx` and `app/global-error.tsx` sit at
  50% each because their JSX body only renders in a browser and this repo has no
  jsdom layer; they stay measured because no Playwright spec exercises the
  error boundary, so an honest lower number beats a quiet exclusion.
- **2026-09-22** — review round: the reCAPTCHA bridge moved from excluded to
  measured (unit-tested with a stubbed document), the root production modules
  gained their own glob, and the integration suite moved to `DATABASE_URL_TEST`.
  Re-measured at 582 tests: features 88/89/86/87 → 90/90/86/88; root modules 100/100/100/100.

### Exclusions and why

| Path | Reason |
| --- | --- |
| `**/*.test.{ts,tsx}`, Vitest defaults | Tests are not the thing measured |
| `src/core/testing/early-access-signup-repository.contract.ts` | A Vitest suite exported as a function, not a module under test |
| `src/features/landing/motion/**`, `src/features/landing/ui/living-lexicon.client.tsx` | Browser-only: their behaviour lives in effects and GSAP timelines that never run under static markup. Covered by `tests/e2e/landing-motion.spec.ts`, `living-lexicon.spec.ts` and `homepage.spec.ts`. Adding a file here requires a Playwright spec that actually runs it; the reCAPTCHA bridge was removed from this list because every E2E run uses the fake CAPTCHA and never loads it. |
| `src/adapters/db/drizzle-early-access-signup.repository.ts` **only when `DATABASE_URL_TEST` is unset** | Its integration suite reads `DATABASE_URL_TEST` only (it truncates the table, and `check` now runs it against whatever `.env.local` holds, so it must never use the application's `DATABASE_URL`). Without that variable the suite self-skips and the file would report ~0% for a reason unrelated to the change under test. `bun run test:coverage` prints a one-line notice when this applies. The CI `test` job passes its disposable branch as `DATABASE_URL_TEST` and never takes this path; to match it locally see "Measuring the Drizzle repository" below. |

Client components that render on the server but act in the browser
(`signup-form.tsx`, `manage-token-bridge.tsx`, `cloze-demo.tsx`) stay measured:
their markup is asserted here and their handlers in Playwright, and the
`src/features/**` threshold already reflects that split.

## Reading a failure

Vitest prints one `ERROR: Coverage for <metric> (<measured>%) does not meet
"<glob>" threshold (<n>%)` line per breached gate, after the test results, and
exits non-zero. The per-file table above it names the uncovered lines. Locally,
`coverage/index.html` shows the same file with the missed branches highlighted.
The CI `test` check runs the same gate, so the same table and the same ERROR
lines appear in its job log. Nothing uploads the HTML report, so a CI-only
breach is read from the log rather than browsed.

## Measuring the Drizzle repository

A coverage run without `DATABASE_URL_TEST` excludes the Drizzle repository,
because its suite self-skips and would otherwise report ~0% and fail the
adapters threshold for a reason unrelated to the change under test. That
exclusion is the one gap between a developer machine and the CI `test` job,
which passes its disposable Neon branch as `DATABASE_URL_TEST`. To close it
locally, start the E2E database and point the driver at the local proxy. Only
ever set `DATABASE_URL_TEST` to a throwaway database: the suite truncates the
signup table before every test.

```sh
docker compose up -d db proxy
docker compose run --rm --no-deps e2e sh -c "bun tests/e2e/support/migrate.mjs"
DATABASE_URL_TEST='postgres://corpus:corpus@127.0.0.1:55432/corpus_landing' \
  DATABASE_URL='postgres://corpus:corpus@127.0.0.1:55432/corpus_landing' \
  DATABASE_URL_UNPOOLED='postgres://corpus:corpus@127.0.0.1:55432/corpus_landing' \
  E2E_NEON_HTTP_ENDPOINT='http://127.0.0.1:4444/sql' \
  NODE_OPTIONS='--import ./tests/e2e/support/neon-local-endpoint.mjs' \
  bun run test:coverage
```
