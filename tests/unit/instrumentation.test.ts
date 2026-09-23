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
 * globals `withSentryConfig` prepends under Turbopack.
 *
 * R-24: an earlier version of this file mocked the two config modules and
 * recorded the load inside each `vi.mock` factory. That does not work, and
 * the comment claiming `vi.resetModules()` made it work was wrong.
 * `vi.resetModules()` calls Vitest's `resetModules(evaluatedModules)` with
 * `resetMocks` defaulting to false, which puts `/^mock:/` in its skip list —
 * so a mocked module is never re-evaluated and its factory runs at most once
 * per file. Every "was not loaded" assertion then held because of that
 * cache, not because of anything `register()` did, and the third test could
 * not fail at all.
 *
 * So the config modules are deliberately NOT mocked here. They are ordinary
 * modules, which `vi.resetModules()` does reset, so each test re-evaluates
 * them for real and `Sentry.init` is called again. Only `@sentry/nextjs` is
 * mocked, which also makes the two configs tellable apart: the Node one adds
 * `Sentry.pinoIntegration(...)` and the edge one does not, so the init call
 * itself says which config loaded.
 */

const init = vi.fn();
const pinoIntegration = vi.fn(() => ({ name: 'pino' }));
const captureRequestError = vi.fn();

vi.mock('@sentry/nextjs', () => ({ init, pinoIntegration, captureRequestError }));

beforeEach(() => {
  // Resets instrumentation.ts and both real config modules; the mocked
  // '@sentry/nextjs' above is intentionally left cached, since its spies are
  // what carry the assertions.
  vi.resetModules();
  init.mockClear();
  pinoIntegration.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('instrumentation.register', () => {
  it('initialises Sentry with the Node config on the nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const { register } = await import('../../instrumentation');

    await register();

    expect(init).toHaveBeenCalledTimes(1);
    // Only sentry.server.config.ts attaches the pino integration, so this is
    // what distinguishes it from the edge config rather than a stub flag.
    expect(pinoIntegration).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0]).toHaveProperty('integrations');
  });

  it('initialises Sentry with the edge config on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const { register } = await import('../../instrumentation');

    await register();

    expect(init).toHaveBeenCalledTimes(1);
    // The edge config passes the shared options straight through, with no
    // Node-only integration.
    expect(pinoIntegration).not.toHaveBeenCalled();
    expect(init.mock.calls[0][0]).not.toHaveProperty('integrations');
  });

  it('initialises nothing outside those two runtimes', async () => {
    vi.stubEnv('NEXT_RUNTIME', undefined);
    const { register } = await import('../../instrumentation');

    await register();

    // Falsifiable now: if register() imported either config, that real module
    // would evaluate and call init. Previously this could not fail.
    expect(init).not.toHaveBeenCalled();
  });
});

describe('instrumentation.onRequestError', () => {
  it('is Sentry.captureRequestError, the hook Next calls on every uncaught RSC/route/Server Action failure', async () => {
    const { onRequestError } = await import('../../instrumentation');

    expect(onRequestError).toBe(captureRequestError);
  });
});
