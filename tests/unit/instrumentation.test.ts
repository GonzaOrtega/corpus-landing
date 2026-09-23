import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `instrumentation.ts` (repo root) sat outside the coverage-measured set
 * entirely (R-15): no test imported it, so a broken `register()` or a
 * renamed `onRequestError` export — the hook Next calls for every uncaught
 * failure in RSC rendering, route handlers and Server Actions — would turn
 * off production error reporting without any check turning red. The
 * dynamic `import('./sentry.server.config')` / `import('./sentry.edge.config')`
 * calls are why `register` uses a dynamic, not static, import (see the
 * source comment): a static import would be hoisted above the build-time
 * globals `withSentryConfig` prepends under Turbopack. Mocked here the same
 * way `instrumentation-client.test.ts` mocks its sibling modules — by
 * resolved path, which is identical whether the mock is declared relative
 * to this test file or to the source file doing the importing.
 *
 * `vi.resetModules()` per test is load-bearing, not tidiness: a `vi.mock`
 * factory runs on first import only, so without it each config mock would
 * fire exactly once across the whole file and these assertions would depend
 * on which test happened to import that config first.
 */

const captureRequestError = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureRequestError }));

const serverConfigLoaded = vi.fn();
vi.mock('../../sentry.server.config', () => {
  serverConfigLoaded();
  return {};
});

const edgeConfigLoaded = vi.fn();
vi.mock('../../sentry.edge.config', () => {
  edgeConfigLoaded();
  return {};
});

beforeEach(() => {
  vi.resetModules();
  serverConfigLoaded.mockClear();
  edgeConfigLoaded.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('instrumentation.register', () => {
  it('loads the Node Sentry config on the nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const { register } = await import('../../instrumentation');

    await register();

    expect(serverConfigLoaded).toHaveBeenCalledTimes(1);
    expect(edgeConfigLoaded).not.toHaveBeenCalled();
  });

  it('loads the edge Sentry config on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const { register } = await import('../../instrumentation');

    await register();

    expect(edgeConfigLoaded).toHaveBeenCalledTimes(1);
    expect(serverConfigLoaded).not.toHaveBeenCalled();
  });

  it('loads neither config outside those two runtimes', async () => {
    vi.stubEnv('NEXT_RUNTIME', undefined);
    const { register } = await import('../../instrumentation');

    await register();

    expect(serverConfigLoaded).not.toHaveBeenCalled();
    expect(edgeConfigLoaded).not.toHaveBeenCalled();
  });
});

describe('instrumentation.onRequestError', () => {
  it('is Sentry.captureRequestError, the hook Next calls on every uncaught RSC/route/Server Action failure', async () => {
    const { onRequestError } = await import('../../instrumentation');

    expect(onRequestError).toBe(captureRequestError);
  });
});
