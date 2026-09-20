import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

// The real-Postgres repository suite self-skips without DATABASE_URL, which
// would report the Drizzle repository at ~0% on a developer machine and fail
// the adapters threshold for a reason unrelated to the change under test. CI
// always provisions a disposable Neon branch, so CI never takes this path and
// the gate stays complete where it matters.
const databaseConfigured = Boolean(process.env.DATABASE_URL);
const drizzleRepositoryPath = 'src/adapters/db/drizzle-early-access-signup.repository.ts';
if (process.argv.includes('--coverage') && !databaseConfigured) {
  console.warn(
    `[coverage] DATABASE_URL is unset: excluding ${drizzleRepositoryPath} (its integration suite is skipped). CI measures it.`,
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
    },
  },
});
