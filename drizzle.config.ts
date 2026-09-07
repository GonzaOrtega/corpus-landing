import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/adapters/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // generate never opens a connection; push/migrate/studio do. Falls back
    // to a placeholder so `drizzle-kit generate` works without a real Neon
    // project yet — see docs/execution/stages.md external prerequisites.
    //
    // Unpooled, not DATABASE_URL: drizzle-kit's migrator takes a session-level
    // advisory lock, which Neon's pooled (PgBouncer transaction-mode) endpoint
    // doesn't support — migrate hangs/fails silently against the pooled URL.
    url: process.env.DATABASE_URL_UNPOOLED ?? 'postgres://placeholder',
  },
  strict: true,
  verbose: true,
});
