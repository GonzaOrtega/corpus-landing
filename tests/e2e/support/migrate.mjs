// Applies migrations to the E2E database through the Neon HTTP proxy, using
// the production `drizzle-orm/neon-http` driver — not `drizzle-kit migrate`.
//
// Why not just `bun run db:migrate`: drizzle-kit picks its own driver by
// probing which DB package resolves from the project root (pg, postgres,
// @vercel/postgres, @neondatabase/serverless, in that order — see
// node_modules/drizzle-kit/bin.cjs). That probe has no concept of
// dev-vs-prod or local-vs-remote; installing `pg` merely to satisfy it here
// would make it the winning driver everywhere `bun install` runs, including
// preview and production deploys — silently rerouting `db:migrate` away from
// Neon in exactly the pipeline this repo cannot afford to reroute. Running
// migrations with the same `neon-http` driver and endpoint override the app
// itself uses keeps the E2E path and the production path identical in every
// way that matters, and needs no extra dependency at all.
//
// Must import neon-local-endpoint.mjs before constructing any Neon client —
// neonConfig.fetchEndpoint is a module-level singleton read at call time.
import './neon-local-endpoint.mjs';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
  console.error('E2E migration: DATABASE_URL_UNPOOLED is required and was not set.');
  process.exit(1);
}

const db = drizzle(neon(connectionString));

try {
  await migrate(db, { migrationsFolder: './drizzle' });
} catch (error) {
  console.error('E2E migration: migration failed.');
  console.error(error);
  process.exit(1);
}
