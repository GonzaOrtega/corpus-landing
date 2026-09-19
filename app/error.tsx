'use client';

import Link from 'next/link';
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
 * Route-segment error boundary: keeps the root layout (fonts, styles) and
 * reuses the not-found page's styling so no new visual design is introduced.
 * Server-side render errors are already reported through `onRequestError`;
 * this covers errors thrown during client rendering and hydration, which no
 * server hook sees.
 */
export default function ErrorPage({
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
    <main className="legal-page wrap">
      <Link className="legal-back" href="/">
        ← Corpus
      </Link>
      <p className="eyebrow">Corpus</p>
      <h1>Something went wrong</h1>
      <p className="legal-description">
        This page could not be shown. You can try again, or go back to the start.
      </p>
      <p>
        <button className="button" onClick={() => retry()} type="button">
          Try again
        </button>
      </p>
    </main>
  );
}
