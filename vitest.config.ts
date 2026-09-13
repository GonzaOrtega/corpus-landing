import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Vitest does not read tsconfig `paths`, so any module reached through the
  // `@/` alias was unresolvable under test. Mirroring the alias here keeps unit
  // tests importable regardless of which import style a module uses.
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '') },
  },
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
    ],
    // No behavior task has landed yet (TDD starts at Task 2/3) — without this,
    // `vitest run` treats zero test files as a failure and the `test` CI
    // check (required per spec §31) is permanently red on a scaffold-only
    // commit. Vitest still exits non-zero the moment a real test fails.
    passWithNoTests: true,
  },
});
