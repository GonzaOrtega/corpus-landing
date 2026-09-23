import type { ErrorReporter } from '../../core/ports/error-reporter.port';
import type { EarlyAccessLogFields, Logger } from '../../core/ports/logger.port';

/**
 * Selected wherever nothing may leave the process: pipeline runs, and any
 * environment without a DSN. Deliberately a class, not a literal, so the
 * capability provider's choice is visible in a test by instance.
 *
 * "Nothing leaves the process" is not "nothing is recorded" (R-09): a
 * boundary turns the failure into a polite retry, so this line is the only
 * trace of it on a developer machine or an unconfigured preview. It carries
 * the allowlisted fields and the error's class name only — never its
 * message, which can hold anything the failing dependency put there. A
 * logger that throws is swallowed: reporting must never break the boundary
 * it serves.
 */
export class NoopErrorReporterAdapter implements ErrorReporter {
  constructor(private readonly logger: Logger) {}

  captureException(error: unknown, fields: EarlyAccessLogFields): void {
    try {
      this.logger.error('Boundary failure not reported: error reporting is disabled', {
        ...fields,
        errorCode: error instanceof Error ? error.name : 'non_error_thrown',
      });
    } catch {
      // See the class comment: never let the reporter break the boundary.
    }
  }
}
