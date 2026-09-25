import { PinoLoggerAdapter } from '../../adapters/logging/pino-logger.adapter';
import { NoopErrorReporterAdapter } from '../../adapters/observability/noop-error-reporter.adapter';
import { SentryErrorReporterAdapter } from '../../adapters/observability/sentry-error-reporter.adapter';
import { buildServerSentryOptions } from '../../config/sentry-options';
import type { ErrorReporter } from '../../core/ports/error-reporter.port';

/**
 * Adapters for the observability capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export interface ObservabilityDeps {
  errorReporter: ErrorReporter;
}

/**
 * Uses the Sentry SDK's own `enabled` rule (`buildServerSentryOptions`,
 * the same call `sentry.server.config.ts` makes) so a boundary never hands
 * an exception to an SDK that will drop it, and a pipeline run never
 * constructs the real adapter at all.
 *
 * `process.env` is passed whole, never read as
 * `process.env.NEXT_PUBLIC_SENTRY_DSN` (R-11): Next.js inlines that literal
 * member expression at build time in server bundles too, while the SDK reads
 * the object at runtime. With the literal, a build made without a DSN and
 * run with one picked the no-op here while the SDK reported everything else
 * — boundary failures alone vanished.
 *
 * Reads `process.env` rather than `ServerConfig`: this must be callable
 * before — and regardless of whether — server configuration validates,
 * because a config failure is exactly the kind of error a boundary wants
 * reported. The Pino adapter needs no configuration, so that still holds.
 */
export const provideObservability = (): ObservabilityDeps => {
  const { enabled } = buildServerSentryOptions(process.env);
  return {
    errorReporter: enabled
      ? new SentryErrorReporterAdapter()
      : new NoopErrorReporterAdapter(new PinoLoggerAdapter()),
  };
};
