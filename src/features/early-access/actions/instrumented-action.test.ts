import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordingErrorReporterAdapter } from '../../../core/testing/recording-error-reporter.adapter';
import { runInstrumentedAction } from './instrumented-action';

const reporter = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../early-access.wiring', () => ({
  getErrorReporter: () => reporter.current,
}));

const requestHeaders = vi.hoisted(() => ({ get: vi.fn(async () => new Headers()) }));
vi.mock('next/headers', () => ({ headers: () => requestHeaders.get() }));

const sentry = vi.hoisted(() => ({
  wrap: vi.fn(async (_name: string, _options: unknown, callback: () => unknown) => callback()),
}));
vi.mock('@sentry/nextjs', () => ({
  withServerActionInstrumentation: (name: string, options: unknown, callback: () => unknown) =>
    sentry.wrap(name, options, callback),
}));

type State = { status: 'retry' } | { status: 'done' };
const RETRY: State = { status: 'retry' };

describe('runInstrumentedAction', () => {
  let recording: RecordingErrorReporterAdapter;

  beforeEach(() => {
    recording = new RecordingErrorReporterAdapter();
    reporter.current = recording;
    requestHeaders.get.mockReset().mockImplementation(async () => new Headers());
    sentry.wrap
      .mockReset()
      .mockImplementation(async (_name, _options, callback: () => unknown) => callback());
  });

  it("returns the work's own result and reports nothing when everything succeeds", async () => {
    const result = await runInstrumentedAction<State>('act', 'op', RETRY, async (given) => {
      expect(given).toBe(recording);
      return { status: 'done' };
    });

    expect(result).toEqual({ status: 'done' });
    expect(recording.reports).toEqual([]);
  });

  it('turns a failure in the work into the retry state, reported as wiring', async () => {
    const failure = new Error('DATABASE_URL is not configured');

    const result = await runInstrumentedAction<State>('act', 'op', RETRY, async () => {
      throw failure;
    });

    expect(result).toBe(RETRY);
    expect(recording.reports).toEqual([
      { error: failure, fields: { operation: 'op', status: 'wiring' } },
    ]);
  });

  it('turns a rejected headers() lookup into the retry state, reported as instrumentation (R-08)', async () => {
    const failure = new Error('headers() called outside a request scope');
    requestHeaders.get.mockRejectedValue(failure);
    const work = vi.fn();

    const result = await runInstrumentedAction<State>('act', 'op', RETRY, work);

    expect(result).toBe(RETRY);
    expect(work).not.toHaveBeenCalled();
    expect(recording.reports).toEqual([
      { error: failure, fields: { operation: 'op', status: 'instrumentation' } },
    ]);
  });

  it('turns a Sentry wrapper that throws before the work into the retry state, reported as instrumentation (R-08)', async () => {
    const failure = new Error('span processor crashed');
    sentry.wrap.mockRejectedValue(failure);
    const work = vi.fn(async (): Promise<State> => ({ status: 'done' }));

    const result = await runInstrumentedAction<State>('act', 'op', RETRY, work);

    // The wrapper never reached the callback, so there is no outcome to keep
    // and the retry state is the only honest answer.
    expect(work).not.toHaveBeenCalled();
    expect(result).toBe(RETRY);
    expect(recording.reports).toEqual([
      { error: failure, fields: { operation: 'op', status: 'instrumentation' } },
    ]);
  });

  it("keeps the work's result when the Sentry wrapper throws after it, reported as instrumentation (R-04)", async () => {
    // The vendored wrapper flushes its span in its own `finally`, i.e. after
    // the callback has already resolved. A signup that actually landed must
    // not come back as "please try again": that invites a duplicate
    // submission and a second confirmation mail.
    const failure = new Error('span flush failed');
    sentry.wrap.mockImplementation(async (_name, _options, callback: () => unknown) => {
      await callback();
      throw failure;
    });

    const result = await runInstrumentedAction<State>('act', 'op', RETRY, async () => ({
      status: 'done',
    }));

    expect(result).toEqual({ status: 'done' });
    expect(recording.reports).toEqual([
      { error: failure, fields: { operation: 'op', status: 'instrumentation' } },
    ]);
  });

  it('reports the work failure once when the wrapper then throws after it (R-04)', async () => {
    const workFailure = new Error('DATABASE_URL is not configured');
    const flushFailure = new Error('span flush failed');
    sentry.wrap.mockImplementation(async (_name, _options, callback: () => unknown) => {
      await callback();
      throw flushFailure;
    });

    const result = await runInstrumentedAction<State>('act', 'op', RETRY, async () => {
      throw workFailure;
    });

    expect(result).toBe(RETRY);
    expect(recording.reports).toEqual([
      { error: workFailure, fields: { operation: 'op', status: 'wiring' } },
      { error: flushFailure, fields: { operation: 'op', status: 'instrumentation' } },
    ]);
  });
});
