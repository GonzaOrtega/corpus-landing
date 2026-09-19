import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptchaRejectedError, SignupClosedError } from '../../../core/errors/early-access-errors';
import { RecordingErrorReporterAdapter } from '../../../core/testing/recording-error-reporter.adapter';
import { joinEarlyAccessAction } from './join-early-access.action';
import { handleJoinEarlyAccess } from './join-early-access.handler';

const wiringReporter = new RecordingErrorReporterAdapter();

vi.mock('../early-access.wiring', () => ({
  getEarlyAccessBackend: () => {
    throw new Error('DATABASE_URL is not configured');
  },
  getErrorReporter: () => wiringReporter,
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

// Records the exact arguments the action passes to the Sentry SDK, so a
// regression that starts recording the response or forwarding formData (both
// forbidden by §24, decision 2.3 of the Sentry observability spec) turns red
// here instead of silently shipping personal data on spans.
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

let joinCalls = 0;
let joinBehavior: () => Promise<void>;
let reporter: RecordingErrorReporterAdapter;
const backend = {
  join: async () => {
    joinCalls += 1;
    await joinBehavior();
  },
};

function form(email: string, captchaToken = 'test-pass') {
  const data = new FormData();
  data.set('email', email);
  data.set('captchaToken', captchaToken);
  return data;
}

describe('joinEarlyAccessAction mapping', () => {
  beforeEach(() => {
    joinCalls = 0;
    joinBehavior = async () => undefined;
    reporter = new RecordingErrorReporterAdapter();
  });

  it('returns the exact public success copy for a valid signup', async () => {
    await expect(
      handleJoinEarlyAccess(backend, form('Person@Example.com'), reporter),
    ).resolves.toEqual({
      status: 'success',
      message:
        "You're on the list. Check your inbox for confirmation — we'll write again when Corpus is ready.",
    });
  });

  it('returns the same success for a duplicate', async () => {
    const first = await handleJoinEarlyAccess(backend, form('person@example.com'), reporter);
    const duplicate = await handleJoinEarlyAccess(backend, form('PERSON@example.com'), reporter);

    expect(duplicate).toEqual(first);
  });

  it('returns explicit invalid-email copy before calling the backend', async () => {
    await expect(handleJoinEarlyAccess(backend, form('invalid'), reporter)).resolves.toEqual({
      status: 'invalid-email',
      message: 'That address looks incomplete. Check it and try again.',
    });
    expect(joinCalls).toBe(0);
  });

  it('maps a missing CAPTCHA token to generic retry rather than an email error', async () => {
    await expect(
      handleJoinEarlyAccess(backend, form('person@example.com', ''), reporter),
    ).resolves.toEqual({
      status: 'retry',
      message: "We couldn't complete that signup. Please try again.",
    });
    expect(joinCalls).toBe(0);
  });

  // The public state is identical on purpose (§24): a bot and an outage must
  // look the same to the caller. Whether the failure is *reported* is what
  // differs — a rejected CAPTCHA is the verifier working, an outage is not.
  it.each([
    ['CAPTCHA rejection', () => new CaptchaRejectedError(), 0],
    ['persistence failure', () => new Error('database unavailable'), 1],
  ])('maps %s to the same generic retry state', async (_name, makeError, reported) => {
    joinBehavior = async () => {
      throw makeError();
    };

    await expect(
      handleJoinEarlyAccess(backend, form('person@example.com'), reporter),
    ).resolves.toEqual({
      status: 'retry',
      message: "We couldn't complete that signup. Please try again.",
    });
    expect(reporter.reports).toHaveLength(reported);
  });

  it('reports the failure before discarding it, with the operation and nothing from the form', async () => {
    const failure = new Error('database unavailable');
    joinBehavior = async () => {
      throw failure;
    };

    await handleJoinEarlyAccess(backend, form('person@example.com'), reporter);

    expect(reporter.reports).toEqual([
      { error: failure, fields: { operation: 'join_early_access' } },
    ]);
    expect(JSON.stringify(reporter.reports[0]?.fields)).not.toContain('person@example.com');
  });

  it('maps launched mode to the closed state without reporting', async () => {
    joinBehavior = async () => {
      throw new SignupClosedError();
    };

    await expect(
      handleJoinEarlyAccess(backend, form('person@example.com'), reporter),
    ).resolves.toEqual({
      status: 'closed',
    });
    expect(reporter.reports).toEqual([]);
  });
});

describe('joinEarlyAccessAction composition boundary', () => {
  it('returns the generic retry state when credentials are not configured, and reports it', async () => {
    wiringReporter.reports.length = 0;

    await expect(
      joinEarlyAccessAction({ status: 'idle' }, form('person@example.com')),
    ).resolves.toEqual({
      status: 'retry',
      message: "We couldn't complete that signup. Please try again.",
    });
    expect(wiringReporter.reports).toEqual([
      {
        error: expect.objectContaining({ message: 'DATABASE_URL is not configured' }),
        fields: { operation: 'join_early_access', status: 'wiring' },
      },
    ]);
  });
});

describe('joinEarlyAccessAction Sentry instrumentation (§24 never-log enforcement layer 3)', () => {
  it('wraps the action with the exact action name, no formData, and recordResponse: false', async () => {
    sentry.calls.length = 0;

    await joinEarlyAccessAction(
      { status: 'idle' },
      form('person@example.com', 'secret-captcha-token'),
    );

    expect(sentry.calls).toHaveLength(1);
    const [call] = sentry.calls;
    expect(call.name).toBe('joinEarlyAccess');
    // Exact equality (not partial) so an added `formData` key — which would
    // carry the visitor's email and CAPTCHA token onto the span — fails this
    // assertion, not just a `recordResponse` typo.
    expect(call.options).toEqual({ headers: expect.any(Headers), recordResponse: false });
    expect(JSON.stringify(call.options)).not.toContain('secret-captcha-token');
    expect(JSON.stringify(call.options)).not.toContain('person@example.com');
  });
});
