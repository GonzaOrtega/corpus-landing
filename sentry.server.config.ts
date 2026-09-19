import * as Sentry from '@sentry/nextjs';
import { buildServerSentryOptions } from './src/config/sentry-options';

/**
 * Node runtime (RSC, Server Actions, route handlers, proxy). Every option
 * that decides what leaves the deployment lives in `sentry-options.ts`;
 * this file only adds the Node-only integration.
 *
 * pinoIntegration listens on pino's diagnostics channel, so the per-request
 * `PinoLoggerAdapter` instances are captured without any change to them:
 * every level becomes a Sentry log, and `logger.error` lines — which the
 * use cases reserve for delivery failures — also become handled issues.
 */
Sentry.init({
  ...buildServerSentryOptions(process.env),
  integrations: [Sentry.pinoIntegration({ error: { levels: ['error'] } })],
});
