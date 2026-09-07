import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'src/**/*.test.ts',
      'app/**/*.test.ts',
    ],
    // No behavior task has landed yet (TDD starts at Task 2/3) — without this,
    // `vitest run` treats zero test files as a failure and the `test` CI
    // check (required per spec §31) is permanently red on a scaffold-only
    // commit. Vitest still exits non-zero the moment a real test fails.
    passWithNoTests: true,
  },
});
