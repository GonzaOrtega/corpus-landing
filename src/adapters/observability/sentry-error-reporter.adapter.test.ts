import { describe, expect, it } from 'vitest';
import type { EarlyAccessLogFields } from '../../core/ports/logger.port';
import { type SentryCapture, SentryErrorReporterAdapter } from './sentry-error-reporter.adapter';

function recordingCapture() {
  const calls: Parameters<SentryCapture>[] = [];
  const capture: SentryCapture = (error, context) => {
    calls.push([error, context]);
  };
  return { calls, capture };
}

describe('SentryErrorReporterAdapter', () => {
  it('forwards the error with allowlisted scalar tags as a handled event', () => {
    const { calls, capture } = recordingCapture();
    const error = new Error('database unavailable');

    new SentryErrorReporterAdapter(capture).captureException(error, {
      operation: 'join_early_access',
      signupId: 'uuid-1',
      attemptCount: 2,
    });

    expect(calls).toEqual([
      [
        error,
        {
          mechanism: { handled: true, type: 'early-access-boundary' },
          captureContext: {
            tags: { operation: 'join_early_access', signupId: 'uuid-1', attemptCount: 2 },
          },
        },
      ],
    ]);
  });

  it('drops fields outside the allowlist and non-scalars inside it, even past the types', () => {
    const { calls, capture } = recordingCapture();
    const smuggled = JSON.parse(
      JSON.stringify({
        operation: 'unsubscribe',
        email: 'person@example.com',
        rawToken: 'raw-token',
        errorCode: { nested: 'person@example.com' },
      }),
    ) as EarlyAccessLogFields;

    new SentryErrorReporterAdapter(capture).captureException(new Error('x'), smuggled);

    expect(calls[0]?.[1].captureContext.tags).toEqual({ operation: 'unsubscribe' });
    expect(JSON.stringify(calls)).not.toContain('person@example.com');
    expect(JSON.stringify(calls)).not.toContain('raw-token');
  });

  it('never lets a failing SDK call escape into the request', () => {
    const adapter = new SentryErrorReporterAdapter(() => {
      throw new Error('transport down');
    });
    expect(() => adapter.captureException(new Error('x'), { operation: 'op' })).not.toThrow();
  });
});
