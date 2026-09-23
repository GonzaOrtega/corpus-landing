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
| Repository integration | `src/adapters/db/*.integration.test.ts` | The SQL, the partial unique index and the driver, against real Postgres | Disposable Neon branch in CI, handed over as `DATABASE_URL_TEST`; skipped locally unless that variable points at a throwaway database |
| Composition and wiring | `src/composition/**/*.test.ts`, `src/features/**/*.wiring.test.ts` | Capability selection by environment, fail-closed production rules, and that each wiring file assembles a working object graph | `vi.stubEnv`; `vi.mock` of `capabilities/persistence` to inject the in-memory repository |
| Delivery: Server Actions, routes, pages, proxy | `src/features/**/actions/*.test.ts`, `app/**/*.test.ts(x)`, `proxy.test.ts` | Validation, error mapping, response shaping, metadata, and server-rendered markup via `renderToStaticMarkup` | `vi.mock` of wiring modules and Next-only modules (`next/font/*`, `next/og`, `next/script`) |
| Runtime bootstrap | `tests/unit/instrumentation.test.ts`, `src/config/sentry-runtime-configs.test.ts` | `register()` loads the right Sentry runtime config for `NEXT_RUNTIME`, `onRequestError` is still `Sentry.captureRequestError` (the hook Next calls on every uncaught RSC/route/Server Action failure), and both `sentry.*.config.ts` forward `buildServerSentryOptions`'s output intact | `vi.mock` of `@sentry/nextjs`, `./sentry-options`, and (for the instrumentation test) both `sentry.*.config.ts` modules |
| Ops script | `scripts/launch-email.test.ts` | Argument parsing and dispatch to `dry-run`/`production`, exhaustively; the `import.meta.main` entry body is 2 lines and untestable in-process (true only for the real process entry) | `vi.mock` of `src/composition/ops/launch.wiring` — `getLaunchOperations` itself is covered by `launch.wiring.test.ts` |
| reCAPTCHA bridge | `src/features/early-access/ui/recaptcha-bridge.test.tsx` | Script injection, reuse of an already-present script tag, the load/error handlers, and the "CAPTCHA is unavailable" failure path — asserted directly rather than through Playwright, since the browser suite always runs with the fake CAPTCHA switch on and so never mounts this component (see the exclusions table) | Hand-stubbed `document`/`window` globals, no jsdom — same technique as `tests/unit/instrumentation-client.test.ts` |
| Browser behaviour | `tests/e2e/*.spec.ts` (Playwright) | Motion, the Living Lexicon, signup and management journeys, axe, prototype parity | Local Postgres behind a Neon HTTP proxy, fake CAPTCHA and email |
| Configuration regressions | `tests/unit/*.test.ts` | Workflow, compose, Lighthouse and font-asset invariants; that every top-level `src/` directory and every standalone root file in `coverage.include` has its own coverage threshold glob, and that no glob is enforced below its layer's agreed target (R-06) | — |

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

Provider: `@vitest/coverage-v8`, exact-pinned at `5.0.0` against `vitest`'s
`^5.0.0`; it must track the Vitest **major**, so bump the pair together.
Measured files: `src/**`, `app/**`, `proxy.ts`, `instrumentation.ts`,
`instrumentation-client.ts`, `sentry.server.config.ts`,
`sentry.edge.config.ts`, `next.config.ts`, `scripts/launch-email.ts` — the
root runtime modules Next calls directly, plus the one ops script, each with
its own threshold entry rather than the catch-all below. The rest of
`scripts/` (the stack-conformance tool) is not part of the measured set.
Thresholds are per glob and evaluated on every `test:coverage` run; the build
fails below any of them.

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
| `instrumentation.ts` | 80 | 100 / 100 / 100 / 100 |
| `instrumentation-client.ts` | 80 | 100 / 100 / 100 / 100 |
| `sentry.server.config.ts` | 80 | 100 / 100 / 100 / 100 |
| `sentry.edge.config.ts` | 80 | 100 / 100 / 100 / 100 |
| `next.config.ts` | 80 | 100 / 100 / 100 / 100 |
| `scripts/launch-email.ts` | 80 | 86 / 93 / 100 / 88 |
| anything else | 80 | 80 / 80 / 80 / 80 (a floor under every measured file — see below, it is not what protects a new directory) |

Enforced values are `max(target, floor(measured))`, but not all measured at
the same time: most were set when the gate was introduced (2026-09-20, 454
tests). `src/config/**`, `src/features/**` and `app/**` were re-measured
after merging `main`'s Sentry observability work into this branch
(2026-09-22, 562 tests) and moved down — a recorded lowering, see the
ratchet rule below — and `src/features/**` moved again, upward, later in
that same 2026-09-22 date once `recaptcha-bridge.tsx` became measured
(R-11). The adapters row accounts for the Drizzle repository, which only CI
measures: its unit suite alone leaves it at 100 / 85 / 100 / 98, and the
aggregate with that lower bound is 100 / 92 / 100 / 99. CI adds the
integration suite on top, so CI can only measure higher — measured there at
98 / 93 / 100 / 100 against a disposable Neon branch.

The bare `lines`/`branches`/`functions`/`statements` keys are **not** scoped
to files the glob rows above leave unclaimed: Vitest's threshold resolver
builds that bucket from every measured file regardless of glob membership
(`resolveThresholds` in the installed `@vitest/coverage-v8`, whose own
comment reads "Global threshold is for all files, even if they are included
by glob patterns"). A wholly untested new top-level directory is averaged
into a global that already sits well above 80% from `src/core/**` and
friends, so on its own this row would not fail (R-06). What actually
prevents a new directory or root file from shipping unmeasured is
`tests/unit/coverage-thresholds.test.ts`: it fails unless every top-level
`src/` directory and every standalone file named in `coverage.include` has
its own row in the table above, and unless every row still sits at or above
the agreed target for its layer — so a later re-measure cannot quietly lower
a gate instead of raising it.

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
moved down. The ratchet rule above is only auditable if raises and lowerings
are both written down.

- **2026-09-20** — gate introduced at 454 tests. Floors set from that
  measurement: core 100/100/100/100; adapters 100/92/100/99; composition
  98/100/93/98; config 100/100/100/100; ops 95/90/100/95; features
  88/89/87/87; components and app 100/100/100/100; proxy 100/97/100/100.
- **2026-09-22 — recorded lowering.** This branch forked before `main`'s
  Sentry observability work existed, so merging `main` in was the first time
  the gate ever measured that code. Two files conflicted and four tests failed
  on contact. Re-measured at 562 tests: config 100/100/100/100 →
  99/97/100/98; features 88/89/87/87 → 88/89/86/87; app 100/100/100/100 →
  93/94/80/93. Not a lowering to buy green — every agreed target is still met;
  what moved is the surplus the ratchet had banked against a codebase with no
  Sentry in it. `app/error.tsx` and `app/global-error.tsx` are half of the
  `app/**` drop at 50% each: they render on the server but act only in the
  browser, and the `browserOnly` exclusion list requires a Playwright spec per
  entry while no spec exercises the error boundary. They stay measured — an
  honest lower number beats a quiet exclusion.
- **2026-09-22 — review round (raises).** `recaptcha-bridge.tsx` moved from
  excluded to measured (R-11, unit-tested with a stubbed document), the root
  runtime modules and `scripts/launch-email.ts` joined the measured set
  (R-15), and the integration suite moved to `DATABASE_URL_TEST` (R-01).
  Re-measured: features 88/89/86/87 → 90/90/86/88; root modules
  100/100/100/100; `scripts/launch-email.ts` 86/93/100/88.
- **2026-09-23 — branch reconciliation.** A second line of work fixed the same
  findings in parallel; merging it added `instrumentation-client.ts` and
  `next.config.ts` to the measured set with the tests that cover them
  (`tests/unit/instrumentation-client.test.ts`,
  `tests/unit/next-config-headers.test.ts`), both at 100/100/100/100. No
  enforced value moved down.

### Exclusions and why

| Path | Reason |
| --- | --- |
| `**/*.test.{ts,tsx}`, Vitest defaults | Tests are not the thing measured |
| `src/core/testing/early-access-signup-repository.contract.ts` | A Vitest suite exported as a function, not a module under test |
| `src/features/landing/motion/**`, `src/features/landing/ui/living-lexicon.client.tsx` | Browser-only: their behaviour lives in effects and GSAP timelines that never run under static markup. Covered by `tests/e2e/landing-motion.spec.ts`, `living-lexicon.spec.ts` and `homepage.spec.ts`. Adding a file here requires a Playwright spec for it. |
| `src/adapters/db/drizzle-early-access-signup.repository.ts` **only when `DATABASE_URL_TEST` is unset** | Its integration suite self-skips without a database, which would report the file at ~0% locally for a reason unrelated to the change under test. Gated on `DATABASE_URL_TEST`, never the ordinary `DATABASE_URL` (see "Measuring the Drizzle repository" below for why). `bun run test:coverage` prints a one-line notice when this applies. The CI `test` job always sets `DATABASE_URL_TEST` against its disposable branch and never takes this path. |

Client components that render on the server but act in the browser
(`signup-form.tsx`, `manage-token-bridge.tsx`, `cloze-demo.tsx`) stay measured:
their markup is asserted here and their handlers in Playwright, and the
`src/features/**` threshold already reflects that split.

`recaptcha-bridge.tsx` is a browser-only client module by the same
description as the exclusions above, but it is deliberately **not** on that
list: the browser suite always runs with the fake CAPTCHA switch on
(`CORPUS_FAKE_CAPTCHA=1` in both `compose.yaml` and `playwright.config.ts`),
which makes `productionRecaptchaSiteKey` return `null`, so `<SignupForm>`
never renders `<RecaptchaBridge>` and no Playwright spec ever mounts it — the
"requires a Playwright spec" rule the exclusions list enforces cannot be met
honestly here. It is measured and covered directly instead (see the "reCAPTCHA
bridge" row above).

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
adapters threshold for a reason unrelated to the change under test. The suite
reads `DATABASE_URL_TEST` rather than the ordinary `DATABASE_URL` on purpose:
its `beforeEach` unconditionally deletes every row, and `DATABASE_URL` is what
the setup guide tells you to point at the shared Neon `development` branch —
a variable Bun also auto-loads from `.env.local` into every `bun run` script,
including `check`. Keying the destructive suite off a separate, normally-unset
name keeps that database out of scope no matter what invokes Vitest. That
exclusion is the one gap between a developer machine and the CI `test` job,
which always provisions a Neon branch and sets `DATABASE_URL_TEST` explicitly.
To close it locally, start the E2E database and point the driver at the local
proxy, exactly as `docs/verification/definition-of-done.md` documents for the
integration suite. Only ever point `DATABASE_URL_TEST` at a throwaway
database — the suite truncates the signup table before every test:

```sh
docker compose up -d db proxy
docker compose run --rm --no-deps e2e sh -c "bun tests/e2e/support/migrate.mjs"
DATABASE_URL='postgres://corpus:corpus@127.0.0.1:55432/corpus_landing' \
  DATABASE_URL_UNPOOLED='postgres://corpus:corpus@127.0.0.1:55432/corpus_landing' \
  DATABASE_URL_TEST='postgres://corpus:corpus@127.0.0.1:55432/corpus_landing' \
  E2E_NEON_HTTP_ENDPOINT='http://127.0.0.1:4444/sql' \
  NODE_OPTIONS='--import ./tests/e2e/support/neon-local-endpoint.mjs' \
  bun run test:coverage
```
