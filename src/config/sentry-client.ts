import {
  captureException,
  captureRouterTransitionStart,
  consoleLoggingIntegration,
  init,
} from '@sentry/nextjs';
import type { buildClientSentryOptions } from './sentry-options';

/**
 * The browser SDK's entry, in its own module so `instrumentation-client.ts`
 * and the error boundaries can `import()` it lazily. Named imports matter:
 * a dynamic `import('@sentry/nextjs')` keeps the whole namespace — Session
 * Replay and the feedback widget included — because nothing can tree-shake
 * an object whose properties are read at runtime. Measured: 161 KB gzipped
 * that way, 46 KB this way.
 */
export function startSentryClient(options: ReturnType<typeof buildClientSentryOptions>): void {
  init({
    ...options,
    integrations: [consoleLoggingIntegration({ levels: ['warn', 'error'] })],
  });
}

export { captureException, captureRouterTransitionStart };
