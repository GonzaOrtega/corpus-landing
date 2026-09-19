import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/src/config/sentry-client');
  vi.resetModules();
});

describe('reportClientRenderError', () => {
  it('starts the Sentry client on demand and captures the error', async () => {
    const captureBoundaryError = vi.fn();
    vi.doMock('@/src/config/sentry-client', () => ({ captureBoundaryError }));

    const { reportClientRenderError } = await import('./global-error');
    const error = new Error('root layout failed');

    reportClientRenderError(error);

    await vi.waitFor(() => expect(captureBoundaryError).toHaveBeenCalledWith(error));
  });

  it('logs to the console instead of throwing when the lazy chunk fails to load', async () => {
    vi.doMock('@/src/config/sentry-client', () => {
      throw new Error('chunk load failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { reportClientRenderError } = await import('./global-error');

    expect(() => reportClientRenderError(new Error('root layout failed'))).not.toThrow();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
  });
});
