import type { ErrorReporter } from '../../core/ports/error-reporter.port';
import type { EarlyAccessLogFields } from '../../core/ports/logger.port';

/**
 * Selected wherever nothing may leave the process: pipeline runs, and any
 * environment without a DSN. Deliberately a class, not a literal, so the
 * capability provider's choice is visible in a test by instance.
 */
export class NoopErrorReporterAdapter implements ErrorReporter {
  captureException(_error: unknown, _fields: EarlyAccessLogFields): void {}
}
