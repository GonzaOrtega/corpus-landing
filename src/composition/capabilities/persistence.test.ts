import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrizzleEarlyAccessSignupRepository } from '../../adapters/db/drizzle-early-access-signup.repository';
import type { ServerConfig } from '../../config/server-env';
import { providePersistence } from './persistence';

const config = { databaseUrl: 'postgres://user:pass@host.example/db' } as ServerConfig;

describe('providePersistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs the Drizzle repository over an HTTP Neon client without connecting', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { earlyAccessSignupRepository } = providePersistence(config);

    expect(earlyAccessSignupRepository).toBeInstanceOf(DrizzleEarlyAccessSignupRepository);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails at composition time when the connection string is malformed', () => {
    expect(() => providePersistence({ ...config, databaseUrl: 'not a url' })).toThrow();
  });
});
