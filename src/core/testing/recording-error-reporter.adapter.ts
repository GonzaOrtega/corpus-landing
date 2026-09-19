import type { ErrorReporter } from '../ports/error-reporter.port';
import type { EarlyAccessLogFields } from '../ports/logger.port';

/** Test double: records what a boundary reported so a test can prove capture-before-discard. */
export class RecordingErrorReporterAdapter implements ErrorReporter {
  readonly reports: Array<{ error: unknown; fields: EarlyAccessLogFields }> = [];

  captureException(error: unknown, fields: EarlyAccessLogFields): void {
    this.reports.push({ error, fields });
  }
}
