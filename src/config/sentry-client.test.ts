import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const captureException = vi.fn();
const captureRouterTransitionStart = vi.fn();
const consoleLoggingIntegration = vi.fn(() => ({ name: 'console-logging' }));

vi.mock('@sentry/nextjs', () => ({
  init,
  captureException,
  captureRouterTransitionStart,
  consoleLoggingIntegration,
}));

const buildClientSentryOptions = vi.fn();
vi.mock('./sentry-options', () => ({
  buildClientSentryOptions: (...args: unknown[]) => buildClientSentryOptions(...args),
}));

/**
 * `ensureSentryStarted`/`captureBoundaryError` memoise the "started" state at
 * module scope (deliberately — that's what lets two independent callers
 * dedupe). Each test needs a fresh module instance so one test's start-up
 * doesn't leak into the next.
 */
async function loadModule() {
  vi.resetModules();
  return import('./sentry-client');
}

beforeEach(() => {
  init.mockClear();
  captureException.mockClear();
  captureRouterTransitionStart.mockClear();
  buildClientSentryOptions.mockReset();
});

describe('ensureSentryStarted', () => {
  it('does nothing when Sentry is disabled (no DSN)', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: false });
    const { ensureSentryStarted } = await loadModule();

    ensureSentryStarted();

    expect(init).not.toHaveBeenCalled();
  });

  it('starts the client exactly once no matter how many times it is called', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true, dsn: 'https://example.test' });
    const { ensureSentryStarted } = await loadModule();

    ensureSentryStarted();
    ensureSentryStarted();
    ensureSentryStarted();

    expect(init).toHaveBeenCalledTimes(1);
  });
});

describe('captureBoundaryError', () => {
  it('starts the client on demand before capturing, when nothing has started it yet', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true, dsn: 'https://example.test' });
    const { captureBoundaryError } = await loadModule();
    const error = new Error('hydration failed');

    captureBoundaryError(error);

    expect(init).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('does not start a second client if the deferred load path already started one', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true, dsn: 'https://example.test' });
    const sentry = await loadModule();

    sentry.ensureSentryStarted();
    sentry.captureBoundaryError(new Error('later error'));

    expect(init).toHaveBeenCalledTimes(1);
  });

  it('still forwards the error when Sentry is disabled, without starting a client', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: false });
    const { captureBoundaryError } = await loadModule();
    const error = new Error('x');

    captureBoundaryError(error);

    expect(init).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(error);
  });
});
