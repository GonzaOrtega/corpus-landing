import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinoLoggerAdapter } from '../../adapters/logging/pino-logger.adapter';
import { NodeTokenGeneratorAdapter } from '../../adapters/security/node-token-generator.adapter';
import { Sha256TokenHasherAdapter } from '../../adapters/security/sha256-token-hasher.adapter';
import { provideConfigSecrets } from './config-secrets';

const env = {
  SITE_URL: 'https://corpus.example',
  DATABASE_URL: 'postgres://user:pass@host.example/db',
  DATABASE_URL_UNPOOLED: 'postgres://user:pass@host.example/db',
};

describe('provideConfigSecrets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses the server configuration and constructs the security and logging adapters', () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

    const deps = provideConfigSecrets();

    expect(deps.serverConfig.siteUrl.href).toBe('https://corpus.example/');
    expect(deps.serverConfig.databaseUrl).toBe(env.DATABASE_URL);
    expect(deps.tokenGenerator).toBeInstanceOf(NodeTokenGeneratorAdapter);
    expect(deps.tokenHasher).toBeInstanceOf(Sha256TokenHasherAdapter);
    expect(deps.logger).toBeInstanceOf(PinoLoggerAdapter);
  });

  it('fails closed when the database connection string is missing', () => {
    vi.stubEnv('SITE_URL', env.SITE_URL);
    vi.stubEnv('DATABASE_URL', undefined);
    vi.stubEnv('DATABASE_URL_UNPOOLED', undefined);

    expect(() => provideConfigSecrets()).toThrow();
  });
});
