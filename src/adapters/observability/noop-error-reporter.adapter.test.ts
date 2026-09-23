import { describe, expect, it } from 'vitest';
import type { EarlyAccessLogFields, Logger } from '../../core/ports/logger.port';
import { NoopErrorReporterAdapter } from './noop-error-reporter.adapter';

function recordingLogger() {
  const calls: Array<{ level: string; message: string; fields: EarlyAccessLogFields }> = [];
  const record =
    (level: string) =>
    (message: string, fields: EarlyAccessLogFields): void => {
      calls.push({ level, message, fields });
    };
  const logger: Logger = { info: record('info'), warn: record('warn'), error: record('error') };
  return { logger, calls };
}

describe('NoopErrorReporterAdapter', () => {
  it('records the failure locally with the allowlisted fields and the error class, never the message (R-09)', () => {
    const { logger, calls } = recordingLogger();
    const error = new TypeError('connect failed for person@example.com');

    new NoopErrorReporterAdapter(logger).captureException(error, {
      operation: 'join_early_access',
      status: 'wiring',
    });

    expect(calls).toEqual([
      {
        level: 'error',
        message: 'Boundary failure not reported: error reporting is disabled',
        fields: { operation: 'join_early_access', status: 'wiring', errorCode: 'TypeError' },
      },
    ]);
    expect(JSON.stringify(calls)).not.toContain('person@example.com');
  });

  it('names a thrown non-Error value without serialising it', () => {
    const { logger, calls } = recordingLogger();

    new NoopErrorReporterAdapter(logger).captureException('raw-token-value', {
      operation: 'unsubscribe',
    });

    expect(calls[0]?.fields).toEqual({ operation: 'unsubscribe', errorCode: 'non_error_thrown' });
    expect(JSON.stringify(calls)).not.toContain('raw-token-value');
  });

  it('never throws, even when the logger does', () => {
    const throwing: Logger = {
      info: () => {},
      warn: () => {},
      error: () => {
        throw new Error('stdout closed');
      },
    };

    expect(() =>
      new NoopErrorReporterAdapter(throwing).captureException(new Error('x'), {
        operation: 'resolve_management',
      }),
    ).not.toThrow();
  });
});
