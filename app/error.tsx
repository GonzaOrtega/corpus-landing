'use client';

import Link from 'next/link';
import { useEffect } from 'react';

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
    // Dynamic on purpose: a static import would put the SDK in the root
    // client chunk of every page; see instrumentation-client.ts.
    void import('@/src/config/sentry-client').then((sentry) => sentry.captureException(error));
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
