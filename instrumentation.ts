import * as Sentry from '@sentry/nextjs';

/**
 * Next.js instrumentation hook (App Router, Next 15+). The runtime configs
 * are loaded with dynamic imports on purpose: `withSentryConfig` prepends
 * build-time globals (release, tunnel path) to this file under Turbopack,
 * and a static import would be hoisted above them.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/** Every uncaught error in RSC rendering, route handlers, Server Actions and the proxy. */
export const onRequestError = Sentry.captureRequestError;
