import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/adapters/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // generate never opens a connection; push/migrate/studio do. Falls back
    // to a placeholder so `drizzle-kit generate` works without a real Neon
    // project yet — see docs/execution/stages.md external prerequisites.
    url: process.env.DATABASE_URL ?? 'postgres://placeholder',
  },
  strict: true,
  verbose: true,
});
