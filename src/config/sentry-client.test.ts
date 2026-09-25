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

  it('tries again on the next call when a start-up throws (R-31)', async () => {
    buildClientSentryOptions.mockReturnValue({ enabled: true, dsn: 'https://example.test' });
    init.mockImplementationOnce(() => {
      throw new Error('init failed');
    });
    const { ensureSentryStarted } = await loadModule();

    expect(() => ensureSentryStarted()).toThrow('init failed');
    ensureSentryStarted();
    ensureSentryStarted();

    expect(init).toHaveBeenCalledTimes(2);
  });
});

describe('ensureSentryStarted — what actually reaches Sentry.init', () => {
  /**
   * R-33: the four tests above only count `init` calls against a builder
   * stub of `{ enabled, dsn }`. That stays green if `ensureSentryStarted`
   * drops the `...options` spread (so the scrub hooks built by
   * `buildClientSentryOptions` — proven correct in sentry-options.test.ts —
   * never reach the SDK) or if a Session Replay / feedback-widget
   * integration is appended (forbidden by spec §25 and decision 1 of
   * docs/superpowers/specs/2026-09-19-sentry-observability-design.md).
   * This asserts on the exact object the mocked `init` received.
   */
  it('passes every builder-produced option straight through, and adds nothing but the console-logging integration', async () => {
    const beforeSend = vi.fn();
    const beforeSendTransaction = vi.fn();
    const beforeSendLog = vi.fn();
    const beforeSendSpan = vi.fn();
    const options = {
      enabled: true,
      dsn: 'https://example.test',
      tunnel: '/monitoring?o=1&p=1',
      beforeSend,
      beforeSendTransaction,
      beforeSendLog,
      beforeSendSpan,
    };
    buildClientSentryOptions.mockReturnValue(options);
    const { ensureSentryStarted } = await loadModule();

    ensureSentryStarted();

    expect(init).toHaveBeenCalledTimes(1);
    const initArg = init.mock.calls[0]?.[0];
    // Every key the builder produced — dsn, tunnel, and the beforeSend /
    // beforeSendTransaction / beforeSendLog scrub hooks — must reach
    // `Sentry.init` by reference. Dropping the `...options` spread leaves
    // `initArg` as just `{ integrations }`, failing this.
    expect(initArg).toMatchObject(options);
    // Exactly one integration: the console-logging one this module adds
    // itself. A second entry (Session Replay, the feedback widget, or
    // anything else) fails this.
    expect(initArg.integrations).toEqual([{ name: 'console-logging' }]);
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
