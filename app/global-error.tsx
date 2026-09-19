'use client';

import { useEffect } from 'react';

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
    // Dynamic on purpose: a static import would put the SDK in the root
    // client chunk of every page; see instrumentation-client.ts.
    void import('@/src/config/sentry-client').then((sentry) => sentry.captureException(error));
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
