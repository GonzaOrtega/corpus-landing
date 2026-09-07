import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Database = ReturnType<typeof createNeonDatabase>;

/**
 * HTTP-mode Neon client — fine for the request-scoped queries this
 * repository issues. Only drizzle-kit's migrator needs the unpooled,
 * session-based connection (see drizzle.config.ts).
 */
export function createNeonDatabase(connectionString: string) {
  return drizzle(neon(connectionString), { schema });
}
