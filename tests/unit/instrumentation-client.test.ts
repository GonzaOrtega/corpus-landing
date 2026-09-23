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
  // Restores the console.error spy the failure test installs.
  vi.restoreAllMocks();
  /**
   * R-28: the failure test below swaps in a throwing `sentry-client` with
   * `vi.doMock`. It used to undo that with `vi.doUnmock`, which does not
   * restore this file's own hoisted `vi.mock` — it removes the registration
   * outright, so every later test received the real module and the suite
   * only passed because that test happened to be declared last. Re-register
   * the stub instead, unconditionally, so no test's position matters.
   */
  vi.doMock('../../src/config/sentry-client', () => ({
    ensureSentryStarted,
    captureRouterTransitionStart,
  }));
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
  });

  /**
   * Declared immediately after the failure test on purpose: it is the case
   * that used to break. If the throwing `vi.doMock` above is ever undone with
   * `vi.doUnmock` again, this test receives the real `sentry-client` module
   * instead of the stub and fails, naming the leak.
   */
  it('still sees the stubbed client after the failure test, whatever the order', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true });
    stubCompletedPageLoad();

    await import('../../instrumentation-client');

    await vi.waitFor(() => expect(ensureSentryStarted).toHaveBeenCalledTimes(1));
  });
});
