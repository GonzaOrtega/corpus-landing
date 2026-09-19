'use client';

import { useEffect } from 'react';

/**
 * Exported for tests. Dynamic import on purpose: a static one would put the
 * SDK in the root client chunk of every page; see instrumentation-client.ts.
 * Goes through `captureBoundaryError` rather than `captureException` because
 * a hydration or first-paint error — exactly what this boundary exists to
 * catch — fires before instrumentation-client.ts's deferred `load` start-up
 * has run, and Sentry drops a report silently with no client bound to the
 * scope; `captureBoundaryError` starts one on demand. A failed chunk fetch
 * (a likely companion to the very error being reported, right after a
 * redeploy) is logged here instead of becoming an unhandled rejection.
 */
export function reportClientRenderError(error: Error): void {
  void import('@/src/config/sentry-client')
    .then((sentry) => sentry.captureBoundaryError(error))
    .catch((cause: unknown) => {
      console.error('Failed to report a client render error to Sentry', cause);
    });
}

/**
 * Replaces the root layout when the layout itself fails, so it must render
 * its own document and cannot rely on the app's stylesheet or fonts.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientRenderError(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            fontFamily: 'system-ui, sans-serif',
            margin: '4rem auto',
            maxWidth: '36rem',
            padding: '0 1rem',
          }}
        >
          <p>Corpus</p>
          <h1>Something went wrong</h1>
          <p>The site could not be shown. You can try again, or come back a little later.</p>
          <button onClick={() => retry()} type="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
