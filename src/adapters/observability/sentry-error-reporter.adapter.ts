import { captureException } from '@sentry/nextjs';
import type { ErrorReporter } from '../../core/ports/error-reporter.port';
import { allowlistLogFields, type EarlyAccessLogFields } from '../../core/ports/logger.port';

/** The one SDK call this adapter needs — injectable so tests never touch a client. */
export type SentryCapture = (error: unknown, hint: SentryCaptureHint) => unknown;

export interface SentryCaptureHint {
  mechanism: { handled: boolean; type: string };
  captureContext: { tags: Record<string, string | number> };
}

/**
 * Forwards a boundary-caught exception to Sentry with the port's scalar
 * allowlist as tags and nothing else. The SDK-level scrubbers in
 * `sentry-options.ts` still run on the resulting event, so an email inside
 * the error message is redacted even though this adapter never inspects it.
 */
export class SentryErrorReporterAdapter implements ErrorReporter {
  constructor(private readonly capture: SentryCapture = captureException) {}

  captureException(error: unknown, fields: EarlyAccessLogFields): void {
    try {
      this.capture(error, {
        mechanism: { handled: true, type: 'early-access-boundary' },
        captureContext: { tags: allowlistLogFields(fields) },
      });
    } catch {
      // Reporting must never fail the request it describes.
    }
  }
}
