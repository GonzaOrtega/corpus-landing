import { NoopErrorReporterAdapter } from '../../adapters/observability/noop-error-reporter.adapter';
import { SentryErrorReporterAdapter } from '../../adapters/observability/sentry-error-reporter.adapter';
import { isPipelineRun } from '../../config/runtime-environment';
import { readSetting } from '../../config/sentry-options';
import type { ErrorReporter } from '../../core/ports/error-reporter.port';

/**
 * Adapters for the observability capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export interface ObservabilityDeps {
  errorReporter: ErrorReporter;
}

/**
 * Mirrors the Sentry SDK's own `enabled` rule (`buildServerSentryOptions`)
 * so a boundary never hands an exception to an SDK that will drop it, and a
 * pipeline run never constructs the real adapter at all. Reads `process.env`
 * directly rather than `ServerConfig`: this must be callable before — and
 * regardless of whether — server configuration validates, because a config
 * failure is exactly the kind of error a boundary wants reported.
 */
export const provideObservability = (): ObservabilityDeps => {
  const dsn = readSetting(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const enabled = dsn !== undefined && !isPipelineRun(process.env);
  return {
    errorReporter: enabled ? new SentryErrorReporterAdapter() : new NoopErrorReporterAdapter(),
  };
};
