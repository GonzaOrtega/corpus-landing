import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

// The real-Postgres repository suite runs only against DATABASE_URL_TEST — a
// throwaway database, never the application's DATABASE_URL, because the suite
// truncates the signup table and `bun run check` now runs it against whatever
// `.env.local` holds. Without that variable the suite self-skips, which would
// report the Drizzle repository at ~0% and fail the adapters threshold for a
// reason unrelated to the change under test, so the file is excluded here and
// measured where a database exists: the CI `test` job, and any machine that
// follows docs/quality/testing.md ("Measuring the Drizzle repository").
const databaseConfigured = Boolean(process.env.DATABASE_URL_TEST);
const drizzleRepositoryPath = 'src/adapters/db/drizzle-early-access-signup.repository.ts';
if (process.argv.includes('--coverage') && !databaseConfigured) {
  console.warn(
    `[coverage] DATABASE_URL_TEST is unset: excluding ${drizzleRepositoryPath} (its integration suite is skipped). The CI test job measures it.`,
  );
}

// Browser-only client modules. Their behaviour lives entirely in effects and
// GSAP timelines that never run under renderToStaticMarkup, and this repo has
// no jsdom/testing-library layer by decision. They are covered by Playwright:
// tests/e2e/landing-motion.spec.ts, living-lexicon.spec.ts, homepage.spec.ts.
// Adding a file here requires an e2e spec that actually runs it — the
// reCAPTCHA bridge used to sit here on the strength of signup.spec.ts, but
// every E2E run uses the fake CAPTCHA and never loads the bridge, so it is
// measured and unit-tested with a stubbed document instead.
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
    include: [
      'tests/unit/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
      'proxy.test.ts',
    ],
    coverage: {
      provider: 'v8',
      // `include` (not the removed `coverage.all`) is what makes files that no
      // test imports appear in the report at 0% instead of vanishing.
      include: [
        'src/**/*.{ts,tsx}',
        'app/**/*.{ts,tsx}',
        'proxy.ts',
        // Root-level production modules: the Next instrumentation hooks and the
        // Sentry runtime configs are live code, and deleting one would silently
        // switch off error reporting with nothing turning red if unmeasured.
        'instrumentation.ts',
        'instrumentation-client.ts',
        'sentry.server.config.ts',
        'sentry.edge.config.ts',
        'next.config.ts',
      ],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.test.{ts,tsx}',
        // A Vitest suite exported as a function, not a module under test.
        'src/core/testing/early-access-signup-repository.contract.ts',
        ...browserOnly,
        ...(databaseConfigured ? [] : [drizzleRepositoryPath]),
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
      // adapters/composition/config/ops 90 · features, components, app and
      // proxy 80. The adapters floor already accounts for the Drizzle
      // repository CI measures on top of the local run.
      //
      // The floor is a measurement, so merging code that this branch never
      // measured can lower it. That happened once already: `src/config/**`,
      // `src/features/**` and `app/**` were measured before the Sentry
      // observability work existed, and re-measuring after that merge moved
      // them down to the values below. Every agreed target above is still
      // met; what moved is the bonus the ratchet had banked. `app/error.tsx`
      // and `app/global-error.tsx` are the bulk of the app drop, at 50% each:
      // the uncovered half is the JSX body of a client component, and
      // rendering it needs the jsdom/testing-library layer this repo declined.
      // They are deliberately NOT added to `browserOnly` above, because that
      // list requires an e2e spec per entry and no spec exercises the error
      // boundary — an honest lower number beats a quiet exclusion.
      thresholds: {
        // Aggregate floor over the files no glob below claims. It is an
        // average, not a per-directory net: a new `src/<dir>/` with no tests
        // would be diluted by everything else, so every top-level directory
        // must be claimed by its own glob — tests/unit/coverage-thresholds.test.ts
        // fails the build when one is missing or set below its layer's target.
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        'src/core/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/adapters/**': { lines: 100, branches: 92, functions: 100, statements: 99 },
        'src/composition/**': { lines: 98, branches: 100, functions: 93, statements: 98 },
        'src/config/**': { lines: 99, branches: 97, functions: 100, statements: 98 },
        'src/ops/**': { lines: 95, branches: 90, functions: 100, statements: 95 },
        'src/features/**': { lines: 90, branches: 90, functions: 86, statements: 88 },
        'src/components/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'app/**': { lines: 93, branches: 94, functions: 80, statements: 93 },
        'proxy.ts': { lines: 100, branches: 97, functions: 100, statements: 100 },
        '{instrumentation,instrumentation-client,sentry.*.config,next.config}.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
