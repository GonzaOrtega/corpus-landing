import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

// The real-Postgres repository suite self-skips without DATABASE_URL_TEST,
// which would report the Drizzle repository at ~0% on a developer machine and
// fail the adapters threshold for a reason unrelated to the change under
// test. Keyed on DATABASE_URL_TEST, not DATABASE_URL: the suite's
// `beforeEach` unconditionally deletes every row, and DATABASE_URL is what
// the setup guide tells a developer to point at the shared Neon
// `development` branch (which Bun also auto-loads from `.env.local` into
// every `bun run` script). Gating on a separate, normally-unset name keeps
// that database out of scope by construction. The CI `test` job explicitly
// provisions DATABASE_URL_TEST against its disposable Neon branch, so it
// never takes this path and measures the file for real;
// docs/quality/testing.md ("Measuring the Drizzle repository") has the
// recipe for matching that locally.
const testDatabaseConfigured = Boolean(process.env.DATABASE_URL_TEST);
const drizzleRepositoryPath = 'src/adapters/db/drizzle-early-access-signup.repository.ts';
if (process.argv.includes('--coverage') && !testDatabaseConfigured) {
  console.warn(
    `[coverage] DATABASE_URL_TEST is unset: excluding ${drizzleRepositoryPath} (its integration suite is skipped). The CI test job measures it.`,
  );
}

// Browser-only client modules. Their behaviour lives entirely in effects and
// GSAP timelines that never run under renderToStaticMarkup, and this repo has
// no jsdom/testing-library layer by decision. They are covered by Playwright:
// tests/e2e/landing-motion.spec.ts, living-lexicon.spec.ts and
// homepage.spec.ts. Adding a file here requires an e2e spec.
//
// recaptcha-bridge.tsx (R-11) is deliberately NOT on this list even though
// it is a browser-only client module by the same description: the browser
// suite always runs with the fake CAPTCHA switch on (CORPUS_FAKE_CAPTCHA=1
// in both compose.yaml and playwright.config.ts), which makes
// productionRecaptchaSiteKey return null, which means `<SignupForm>` never
// renders `<RecaptchaBridge>` and no Playwright spec ever mounts it — the
// "requires an e2e spec" rule this list enforces cannot be met honestly for
// this file. It is measured instead, by
// src/features/early-access/ui/recaptcha-bridge.test.tsx, which drives
// `getRecaptchaToken` directly with hand-stubbed `document`/`window`
// globals (same technique as tests/unit/instrumentation-client.test.ts).
const browserOnly = [
  'src/features/landing/motion/**',
  'src/features/landing/ui/living-lexicon.client.tsx',
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Vitest does not read tsconfig `paths`, so any module reached through
      // the `@/` alias was unresolvable under test. Mirroring the alias here
      // keeps unit tests importable regardless of which import style a module
      // uses.
      { find: /^@\/(.*)$/, replacement: `${root}/$1` },
      // `server-only` throws unless resolved under Next's `react-server`
      // condition (which maps it to an empty module). Mirror that mapping.
      { find: /^server-only$/, replacement: `${root}/tests/setup/server-only.stub.ts` },
    ],
  },
  test: {
    environment: 'node',
    /**
     * Above Vitest's 5s default because this suite runs one isolated worker
     * per file — a hundred of them — which oversubscribes a developer machine
     * and starves individually-fast tests. Two of them boot heavy third-party
     * config systems (`lighthouse-config.test.ts` initialises Lighthouse's
     * real config twice) and were being killed at ~5.0s while completing in
     * ~1.2s when run alone, with a different file losing the race on each
     * run. The 5s was measuring contention, not the code.
     *
     * This costs nothing on a green run, since a timeout only applies to a
     * test that is already failing, and it still catches a genuine hang —
     * `recaptcha-bridge.test.tsx` relies on exactly that.
     */
    testTimeout: 15_000,
    include: [
      'tests/unit/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
      'proxy.test.ts',
      'scripts/launch-email.test.ts',
    ],
    coverage: {
      provider: 'v8',
      // `include` (not the removed `coverage.all`) is what makes files that no
      // test imports appear in the report at 0% instead of vanishing. The root
      // runtime files and the ops script (R-15) join `proxy.ts` here rather
      // than a broad `scripts/**`: the rest of `scripts/` (stack-conformance)
      // is a separate, unmeasured tool this finding never named.
      include: [
        'src/**/*.{ts,tsx}',
        'app/**/*.{ts,tsx}',
        'proxy.ts',
        'instrumentation.ts',
        'instrumentation-client.ts',
        'sentry.server.config.ts',
        'sentry.edge.config.ts',
        'next.config.ts',
        'scripts/launch-email.ts',
      ],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.test.{ts,tsx}',
        // A Vitest suite exported as a function, not a module under test.
        'src/core/testing/early-access-signup-repository.contract.ts',
        ...browserOnly,
        ...(testDatabaseConfigured ? [] : [drizzleRepositoryPath]),
      ],
      reporter: [
        'text',
        'html',
        'lcov',
        'json-summary',
        ['text-summary', { file: 'coverage-summary.txt' }],
      ],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      // Per-glob hard gates, evaluated on `bun run test:coverage`. Each value is
      // max(agreed target, measured floor) — see docs/quality/testing.md
      // ("Ratchet rule"). Never enable `autoUpdate`. Targets: core 100 ·
      // adapters/composition/config/ops 90 · features, components, app,
      // proxy and the root runtime files (instrumentation.ts, the two Sentry
      // runtime configs) 80 · scripts/launch-email.ts 80. The adapters floor
      // already accounts for the Drizzle repository CI measures on top of
      // the local run.
      //
      // The floor is a measurement, so merging code that this branch never
      // measured can lower it. That happened once already: `src/config/**`,
      // `src/features/**` and `app/**` were measured before the Sentry
      // observability work existed, and re-measuring after that merge moved
      // them down to the values below. Every agreed target above is still
      // met; what moved is the bonus the ratchet had banked. `app/error.tsx`
      // and `app/global-error.tsx` were the bulk of the app drop; since
      // issue #20 they are rendered as plain functions with a synchronous
      // `useEffect` (no jsdom needed) and `app/**` is back up — see the
      // threshold history in docs/quality/testing.md.
      thresholds: {
        // These four bare keys are NOT scoped to files the more specific
        // globs below leave unclaimed: Vitest's threshold resolver builds
        // this "global" bucket from every measured file regardless of glob
        // membership (verified against the installed
        // @vitest/coverage-v8's resolveThresholds — see the comment
        // "Global threshold is for all files, even if they are included by
        // glob patterns" in its source). A wholly untested new top-level
        // directory is averaged into a global that already sits well above
        // 80%, so this alone would not fail (R-06). What actually keeps a
        // new directory or root file from shipping unmeasured is
        // tests/unit/coverage-thresholds.test.ts, which fails unless every
        // top-level src/ directory and every standalone file in
        // `coverage.include` below has its own entry in this object. These
        // four keys stay as a floor under everything, including files that
        // glob does cover.
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        'src/core/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/adapters/**': { lines: 100, branches: 92, functions: 100, statements: 99 },
        'src/composition/**': { lines: 98, branches: 100, functions: 94, statements: 98 },
        'src/config/**': { lines: 99, branches: 99, functions: 100, statements: 99 },
        'src/ops/**': { lines: 95, branches: 90, functions: 100, statements: 95 },
        // R-11: recaptcha-bridge.tsx is now measured (see browserOnly's
        // comment above) and mostly covered, which raised this glob's floor.
        // Ratchet rule: raised to floor(measured) — 90 / 90 / 86 / 88 — in
        // this same PR rather than left at the old, now-stale 88 / 89 / 86 / 87.
        'src/features/**': { lines: 90, branches: 90, functions: 87, statements: 88 },
        'src/components/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'app/**': { lines: 100, branches: 97, functions: 93, statements: 100 },
        'proxy.ts': { lines: 100, branches: 97, functions: 100, statements: 100 },
        // R-15: the root runtime files are fully exercised —
        // instrumentation.ts and instrumentation-client.ts by
        // tests/unit/instrumentation.test.ts and
        // tests/unit/instrumentation-client.test.ts, the two Sentry configs by
        // the existing src/config/sentry-runtime-configs.test.ts, and
        // next.config.ts by tests/unit/next-config-headers.test.ts — so their
        // target is the same 100 the rest of the runtime bootstrap gets.
        // Each gets its own key rather than one brace glob: the conformance
        // net below asserts per-file entries, and launch-email.ts proves the
        // set is not uniformly 100.
        // scripts/launch-email.ts's only uncovered lines are the
        // `import.meta.main` entry body — true only for the actual process
        // entry, so it cannot run under an `import()` from a test; the
        // floor below is `floor(measured)` for the rest of the file.
        'instrumentation.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'instrumentation-client.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'sentry.server.config.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'sentry.edge.config.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'next.config.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'scripts/launch-email.ts': { lines: 86, branches: 93, functions: 100, statements: 88 },
      },
    },
  },
});
