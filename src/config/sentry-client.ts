import {
  captureException,
  captureRouterTransitionStart,
  consoleLoggingIntegration,
  init,
} from '@sentry/nextjs';
import { buildClientSentryOptions } from './sentry-options';

/**
 * The browser SDK's entry, in its own module so `instrumentation-client.ts`
 * and the error boundaries can `import()` it lazily. Named imports matter:
 * a dynamic `import('@sentry/nextjs')` keeps the whole namespace — Session
 * Replay and the feedback widget included — because nothing can tree-shake
 * an object whose properties are read at runtime. Measured: 161 KB gzipped
 * that way, 46 KB this way.
 *
 * Options are computed here, from the same literal `NEXT_PUBLIC_*` member
 * expressions `instrumentation-client.ts` reads (Next.js inlines the literal
 * expression, not `process.env`), so this module can start itself on demand
 * without depending on that file's copy. Both `import()` this module by its
 * resolved path, so the `started` flag below is shared regardless of which
 * caller triggers the fetch first.
 */
const options = buildClientSentryOptions({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE:
    process.env.NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE,
});

let started = false;

/**
 * Idempotent, and safe to call from two independent triggers: the deferred
 * `load` + idle start-up in `instrumentation-client.ts`, and an error
 * boundary starting the client on demand (see `captureBoundaryError`).
 * Whichever runs first calls `init`; the other is a no-op, so a hydration
 * error firing seconds before the deferred path would have run cannot start
 * the client twice. A missing DSN means disabled everywhere, same as before.
 */
export function ensureSentryStarted(): void {
  if (started || !options.enabled) return;
  started = true;
  init({
    ...options,
    integrations: [consoleLoggingIntegration({ levels: ['warn', 'error'] })],
  });
}

/**
 * What the error boundaries call instead of `captureException` directly.
 * `captureException` is a silent no-op when no client is bound to the
 * current scope, and a hydration or first-paint render error — precisely
 * what these boundaries exist to catch — fires before
 * `instrumentation-client.ts`'s deferred start-up has had a chance to run.
 * Starting the SDK here costs nothing on the error-free path: this module is
 * only fetched once a boundary has already rendered.
 */
export function captureBoundaryError(error: unknown): void {
  ensureSentryStarted();
  captureException(error);
}

export { captureException, captureRouterTransitionStart };
