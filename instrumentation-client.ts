import { buildClientSentryOptions } from './src/config/sentry-options';

type SentryClient = typeof import('./src/config/sentry-client');

/**
 * Browser SDK, loaded after the page's `load` event rather than before
 * hydration. Measured on the landing page, initialising it eagerly cost
 * three Lighthouse performance points against a 0.9 gate; deferred, the
 * SDK's parse and init leave the critical path. The trade: an error thrown
 * in the first moments before the chunk arrives is not reported, and the
 * pageload span is assembled from buffered Performance entries rather than
 * observed live. Without a DSN nothing is fetched at all.
 *
 * Each `NEXT_PUBLIC_*` variable is spelled out because Next.js inlines the
 * literal member expression at build time — passing `process.env` through
 * would leave every value undefined in the bundle.
 *
 * No Session Replay and no user feedback widget (spec §25). Console
 * warnings and errors are forwarded as logs. Browser tracing is opt-in
 * (see buildClientSentryOptions) and propagates only to same-origin requests.
 */
const options = buildClientSentryOptions({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE:
    process.env.NEXT_PUBLIC_SENTRY_BROWSER_TRACES_SAMPLE_RATE,
});

let client: Promise<SentryClient> | undefined;

/**
 * `ensureSentryStarted` (not `init` directly) so this deferred path and an
 * error boundary's on-demand path — see `captureBoundaryError` in
 * `sentry-client.ts` — can't both start the client: whichever runs first
 * wins, the other is a no-op against the same module-level flag.
 *
 * A rejected import (a failed chunk fetch) is not cached: `client` is reset
 * so a later call — a router transition, or another error — gets a fresh
 * attempt instead of a permanently poisoned promise.
 */
function loadSentry(): Promise<SentryClient> {
  client ??= import('./src/config/sentry-client')
    .then((sentry) => {
      sentry.ensureSentryStarted();
      return sentry;
    })
    .catch((error: unknown) => {
      client = undefined;
      throw error;
    });
  return client;
}

function afterLoad(task: () => void): void {
  const idle = (): void => {
    // A timeout so a backgrounded tab (which never goes idle) still starts
    // the SDK eventually instead of never.
    if ('requestIdleCallback' in window) window.requestIdleCallback(task, { timeout: 4000 });
    else setTimeout(task, 0);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

if (options.enabled) {
  afterLoad(() => {
    void loadSentry().catch((error: unknown) => {
      console.error('Sentry failed to start after page load', error);
    });
  });
}

export function onRouterTransitionStart(
  url: string,
  navigationType: 'push' | 'replace' | 'traverse',
): void {
  if (!options.enabled) return;
  void loadSentry()
    .then((sentry) => sentry.captureRouterTransitionStart(url, navigationType))
    .catch((error: unknown) => {
      console.error('Sentry failed to record a router transition', error);
    });
}
