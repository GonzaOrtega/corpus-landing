import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordingErrorReporterAdapter } from '../../../core/testing/recording-error-reporter.adapter';
import type { EarlyAccessManagementState } from '../../../core/use-cases/resolve-early-access-management.use-case';
import { handleResolveManagement, handleUnsubscribe } from './management.handlers';
import { resolveManagementAction } from './resolve-management.action';
import { unsubscribeAction } from './unsubscribe.action';

// Wiring is mocked to fail, mirroring join-early-access.action.test.ts's
// composition-boundary pattern: it lets the same tests prove both (a) a
// broken wiring configuration is still reported before the visitor sees the
// retry message, and (b) the Sentry SDK call the actions make around that
// path never carries formData or the response.
const wiringReporter = new RecordingErrorReporterAdapter();

vi.mock('../early-access.wiring', () => ({
  getManagementUseCases: () => {
    throw new Error('DATABASE_URL is not configured');
  },
  getErrorReporter: () => wiringReporter,
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const sentry = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; options: Record<string, unknown> }>,
}));

vi.mock('@sentry/nextjs', () => ({
  withServerActionInstrumentation: async (
    name: string,
    options: Record<string, unknown>,
    callback: () => unknown,
  ) => {
    sentry.calls.push({ name, options });
    return callback();
  },
}));

let reporter: RecordingErrorReporterAdapter;

/**
 * Every place a secret could hide in a report, including the parts of an
 * Error that `JSON.stringify` leaves out (R-21).
 */
function expectNoSecretIn(report: { error: unknown; fields: unknown } | undefined, secret: string) {
  const error = report?.error;
  const parts = [JSON.stringify(report?.fields), JSON.stringify(error)];
  if (error instanceof Error) parts.push(error.message, error.stack ?? '', String(error.cause));
  for (const part of parts) expect(part).not.toContain(secret);
}

describe('management action mapping', () => {
  beforeEach(() => {
    reporter = new RecordingErrorReporterAdapter();
  });

  it('returns active and already-unsubscribed states without changing their public shape', async () => {
    const active: EarlyAccessManagementState = {
      status: 'active',
      maskedEmail: 'g***@example.com',
    };
    await expect(
      handleResolveManagement({ execute: vi.fn(async () => active) }, 'token', reporter),
    ).resolves.toEqual(active);

    const unsubscribed: EarlyAccessManagementState = {
      status: 'unsubscribed',
      maskedEmail: 'g***@example.com',
    };
    await expect(
      handleResolveManagement({ execute: vi.fn(async () => unsubscribed) }, 'token', reporter),
    ).resolves.toEqual(unsubscribed);
  });

  it('collapses invalid and internal resolve failures to non-sensitive public states', async () => {
    await expect(
      handleResolveManagement(
        { execute: vi.fn(async () => ({ status: 'invalid' as const })) },
        'bad',
        reporter,
      ),
    ).resolves.toEqual({ status: 'invalid' });

    // A distinctive secret, not the word "token", and a check that can
    // actually fail (R-21). `fields` is pinned exactly by `toEqual`, and
    // `JSON.stringify` of an Error is `{}` — message, stack and cause are
    // not enumerable — so stringifying the report could never see a secret
    // the handler wrapped into a new error. Instead: the reported error is
    // the very object the use case threw (so nothing was added to it), and
    // the parts JSON.stringify skips are swept explicitly.
    const secretToken = 'placeholder-management-secret-9f2c';
    const thrown = new Error('database body with sensitive details');
    await expect(
      handleResolveManagement(
        {
          execute: vi.fn(async () => {
            throw thrown;
          }),
        },
        secretToken,
        reporter,
      ),
    ).resolves.toEqual({ status: 'retry' });
    expect(reporter.reports).toEqual([
      { error: thrown, fields: { operation: 'resolve_management' } },
    ]);
    expect(reporter.reports[0]?.error).toBe(thrown);
    expectNoSecretIn(reporter.reports[0], secretToken);
  });

  it('only invokes unsubscribe through its explicit action and maps failures generically', async () => {
    const execute = vi.fn(async () => ({ status: 'unsubscribed' as const }));
    await expect(handleUnsubscribe({ execute }, 'token', reporter)).resolves.toEqual({
      status: 'unsubscribed',
    });
    expect(execute).toHaveBeenCalledWith('token');

    await expect(
      handleUnsubscribe(
        {
          execute: vi.fn(async () => {
            throw new Error('private failure');
          }),
        },
        'placeholder-unsubscribe-secret-41ab',
        reporter,
      ),
    ).resolves.toEqual({ status: 'retry' });
    expect(reporter.reports.map((report) => report.fields)).toEqual([{ operation: 'unsubscribe' }]);
    expectNoSecretIn(reporter.reports[0], 'placeholder-unsubscribe-secret-41ab');
  });
});

describe('management actions Sentry instrumentation (§24 never-log enforcement layer 3)', () => {
  beforeEach(() => {
    sentry.calls.length = 0;
  });

  it('wraps resolveManagementAction with no formData and recordResponse: false', async () => {
    await resolveManagementAction('placeholder-management-token');

    expect(sentry.calls).toHaveLength(1);
    const [call] = sentry.calls;
    expect(call.name).toBe('resolveManagement');
    // Exact equality: an added `formData` key (there is none to pass here,
    // but a future edit threading it through would show up) or a flipped
    // `recordResponse` both fail this line, not just a targeted key check.
    expect(call.options).toEqual({ headers: expect.any(Headers), recordResponse: false });
  });

  it('wraps unsubscribeAction with no formData and recordResponse: false', async () => {
    await unsubscribeAction('placeholder-management-token');

    expect(sentry.calls).toHaveLength(1);
    const [call] = sentry.calls;
    expect(call.name).toBe('unsubscribe');
    expect(call.options).toEqual({ headers: expect.any(Headers), recordResponse: false });
  });
});

// Closes the gap noted alongside R-15: joinEarlyAccessAction already had a
// composition-boundary test proving a broken wiring configuration is still
// reported before the visitor sees the retry message; the two management
// actions share that exact code path (see resolve-management.action.ts and
// unsubscribe.action.ts) with no equivalent coverage.
describe('management actions composition boundary', () => {
  beforeEach(() => {
    wiringReporter.reports.length = 0;
  });

  it('returns the generic retry state when credentials are not configured, and reports it (resolveManagementAction)', async () => {
    await expect(resolveManagementAction('placeholder-management-token')).resolves.toEqual({
      status: 'retry',
    });
    expect(wiringReporter.reports).toEqual([
      {
        error: expect.objectContaining({ message: 'DATABASE_URL is not configured' }),
        fields: { operation: 'resolve_management', status: 'wiring' },
      },
    ]);
  });

  it('returns the generic retry state when credentials are not configured, and reports it (unsubscribeAction)', async () => {
    await expect(unsubscribeAction('placeholder-management-token')).resolves.toEqual({
      status: 'retry',
    });
    expect(wiringReporter.reports).toEqual([
      {
        error: expect.objectContaining({ message: 'DATABASE_URL is not configured' }),
        fields: { operation: 'unsubscribe', status: 'wiring' },
      },
    ]);
  });
});
