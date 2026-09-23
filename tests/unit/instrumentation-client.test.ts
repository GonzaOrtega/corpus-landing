import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buildClientSentryOptions = vi.fn();
vi.mock('../../src/config/sentry-options', () => ({
  buildClientSentryOptions: (...args: unknown[]) => buildClientSentryOptions(...args),
}));

const ensureSentryStarted = vi.fn();
const captureRouterTransitionStart = vi.fn();
vi.mock('../../src/config/sentry-client', () => ({
  ensureSentryStarted,
  captureRouterTransitionStart,
}));

/**
 * `instrumentation-client.ts` touches `window`/`document` at import time
 * only when `options.enabled`; these stand in for a completed page load so
 * `afterLoad` runs its callback synchronously instead of waiting on a real
 * browser event loop.
 */
function stubCompletedPageLoad() {
  const requestIdleCallback = vi.fn((task: () => void) => task());
  vi.stubGlobal('document', { readyState: 'complete' });
  vi.stubGlobal('window', { requestIdleCallback, addEventListener: vi.fn() });
  return { requestIdleCallback };
}

beforeEach(() => {
  buildClientSentryOptions.mockReset();
  ensureSentryStarted.mockClear();
  captureRouterTransitionStart.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('instrumentation-client', () => {
  it('never touches window/document or starts a client when Sentry is disabled', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: false });

    const sentry = await import('../../instrumentation-client');
    sentry.onRouterTransitionStart('/next', 'push');

    expect(ensureSentryStarted).not.toHaveBeenCalled();
    expect(captureRouterTransitionStart).not.toHaveBeenCalled();
  });

  it('starts the client through the shared dedupe helper after page load, with an idle timeout', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true });
    const { requestIdleCallback } = stubCompletedPageLoad();

    await import('../../instrumentation-client');
    await vi.waitFor(() => expect(ensureSentryStarted).toHaveBeenCalledTimes(1));

    // A timeout so a backgrounded tab, which never goes idle, still starts
    // the SDK eventually instead of never.
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 4000 });
  });

  it('forwards a router transition to the lazily started client once loaded', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true });
    stubCompletedPageLoad();

    const sentry = await import('../../instrumentation-client');
    sentry.onRouterTransitionStart('/next', 'push');

    await vi.waitFor(() =>
      expect(captureRouterTransitionStart).toHaveBeenCalledWith('/next', 'push'),
    );
  });

  it('waits for the load event and falls back to a timer when the browser has no idle callback', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true });
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal('document', { readyState: 'loading' });
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: () => void) => {
        listeners[type] = listener;
      },
    });

    await import('../../instrumentation-client');
    expect(ensureSentryStarted).not.toHaveBeenCalled();
    listeners.load?.();

    await vi.waitFor(() => expect(ensureSentryStarted).toHaveBeenCalledTimes(1));
  });

  it('reports a client that fails to load, on page load and on a router transition', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true });
    stubCompletedPageLoad();
    vi.doMock('../../src/config/sentry-client', () => {
      throw new Error('chunk fetch failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const sentry = await import('../../instrumentation-client');
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'Sentry failed to start after page load',
        expect.any(Error),
      ),
    );

    sentry.onRouterTransitionStart('/next', 'push');
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'Sentry failed to record a router transition',
        expect.any(Error),
      ),
    );
    expect(ensureSentryStarted).not.toHaveBeenCalled();
    consoleError.mockRestore();
    vi.doUnmock('../../src/config/sentry-client');
  });
});
