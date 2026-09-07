import { PinoLoggerAdapter } from '../../adapters/logging/pino-logger.adapter';
import { NodeTokenGeneratorAdapter } from '../../adapters/security/node-token-generator.adapter';
import { Sha256TokenHasherAdapter } from '../../adapters/security/sha256-token-hasher.adapter';
import { loadServerConfig, type ServerConfig } from '../../config/server-env';
import type { Logger } from '../../core/ports/logger.port';
import type { TokenGenerator } from '../../core/ports/token-generator.port';
import type { TokenHasher } from '../../core/ports/token-hasher.port';

/**
 * Adapters for the config-secrets capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export interface ConfigSecretsDeps {
  serverConfig: ServerConfig;
  tokenGenerator: TokenGenerator;
  tokenHasher: TokenHasher;
  logger: Logger;
}

export const provideConfigSecrets = (): ConfigSecretsDeps => ({
  serverConfig: loadServerConfig(process.env),
  tokenGenerator: new NodeTokenGeneratorAdapter(),
  tokenHasher: new Sha256TokenHasherAdapter(),
  logger: new PinoLoggerAdapter(),
});
