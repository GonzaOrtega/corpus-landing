import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `instrumentation.ts` is the only file that decides whether the Sentry
 * runtime configs load at all. It imports them dynamically per runtime so the
 * build-time globals `withSentryConfig` prepends are not hoisted past; each
 * test imports the module fresh so the dynamic imports are observed per run.
 */
const captureRequestError = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureRequestError }));

const serverInit = vi.fn();
const edgeInit = vi.fn();
vi.mock('../../sentry.server.config', () => {
  serverInit();
  return {};
});
vi.mock('../../sentry.edge.config', () => {
  edgeInit();
  return {};
});

beforeEach(() => {
  vi.resetModules();
  serverInit.mockClear();
  edgeInit.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('instrumentation', () => {
  it('loads only the Node runtime config on the Node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const { register } = await import('../../instrumentation');

    await register();

    expect(serverInit).toHaveBeenCalledTimes(1);
    expect(edgeInit).not.toHaveBeenCalled();
  });

  it('loads only the edge runtime config on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const { register } = await import('../../instrumentation');

    await register();

    expect(edgeInit).toHaveBeenCalledTimes(1);
    expect(serverInit).not.toHaveBeenCalled();
  });

  it('loads nothing when no Next runtime is announced', async () => {
    vi.stubEnv('NEXT_RUNTIME', undefined);
    const { register } = await import('../../instrumentation');

    await register();

    expect(serverInit).not.toHaveBeenCalled();
    expect(edgeInit).not.toHaveBeenCalled();
  });

  it('hands every uncaught request error to Sentry', async () => {
    const { onRequestError } = await import('../../instrumentation');

    expect(onRequestError).toBe(captureRequestError);
  });
});
