import { describe, expect, it, vi } from 'vitest';

// buildContext transitively imports server-env.ts, which imports 'server-only' —
// see src/config/server-env.test.ts for why this mock is required outside Next's
// own server bundling.
vi.mock('server-only', () => ({}));

const baseEnv = {
  SITE_URL: 'https://corpus-landing.example',
  CORPUS_RELEASE_STAGE: 'early-access',
  DATABASE_URL: 'postgres://user:pass@host/db',
  DATABASE_URL_UNPOOLED: 'postgres://user:pass@host/db',
  // No VERCEL_ENV here, which is what a test host looks like. provideExternalApi
  // refuses to pick the CAPTCHA-free verifier by absence alone, so the opt-in is
  // explicit — the same signal compose.yaml and playwright.config.ts pass.
  CORPUS_FAKE_CAPTCHA: '1',
};

describe('wireEarlyAccess', () => {
  it('assembles every dependency the early-access use cases need', async () => {
    for (const [key, value] of Object.entries(baseEnv)) vi.stubEnv(key, value);
    const { buildContext } = await import('../root');
    const { wireEarlyAccess } = await import('./early-access');

    const deps = wireEarlyAccess(buildContext());

    expect(typeof deps.repository.create).toBe('function');
    expect(deps.clock.now()).toBeInstanceOf(Date);
    expect(deps.tokenGenerator.generate().length).toBeGreaterThanOrEqual(43);
    expect(deps.tokenHasher.hash('x')).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof deps.logger.info).toBe('function');

    vi.unstubAllEnvs();
  });
});
