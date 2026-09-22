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
// tests/e2e/landing-motion.spec.ts, living-lexicon.spec.ts, homepage.spec.ts,
// signup.spec.ts (reCAPTCHA bridge). Adding a file here requires an e2e spec.
const browserOnly = [
  'src/features/landing/motion/**',
  'src/features/landing/ui/living-lexicon.client.tsx',
  'src/features/early-access/ui/recaptcha-bridge.tsx',
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
      include: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', 'proxy.ts'],
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
        // Catch-all for any file the globs below do not claim, so a new
        // directory can never ship unmeasured.
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        'src/core/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/adapters/**': { lines: 100, branches: 92, functions: 100, statements: 99 },
        'src/composition/**': { lines: 98, branches: 100, functions: 93, statements: 98 },
        'src/config/**': { lines: 99, branches: 97, functions: 100, statements: 98 },
        'src/ops/**': { lines: 95, branches: 90, functions: 100, statements: 95 },
        'src/features/**': { lines: 88, branches: 89, functions: 86, statements: 87 },
        'src/components/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'app/**': { lines: 93, branches: 94, functions: 80, statements: 93 },
        'proxy.ts': { lines: 100, branches: 97, functions: 100, statements: 100 },
      },
    },
  },
});
