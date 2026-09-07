import { DrizzleEarlyAccessSignupRepository } from '../../adapters/db/drizzle-early-access-signup.repository';
import { createNeonDatabase } from '../../adapters/db/neon-database.adapter';
import type { ServerConfig } from '../../config/server-env';
import type { EarlyAccessSignupRepository } from '../../core/repositories/early-access-signup.repository';

/**
 * Adapters for the persistence capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export interface PersistenceDeps {
  earlyAccessSignupRepository: EarlyAccessSignupRepository;
}

export const providePersistence = (config: ServerConfig): PersistenceDeps => {
  const db = createNeonDatabase(config.databaseUrl);
  return {
    earlyAccessSignupRepository: new DrizzleEarlyAccessSignupRepository(db),
  };
};
