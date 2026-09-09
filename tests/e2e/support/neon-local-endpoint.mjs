// The ONLY place the Neon HTTP endpoint is redirected. It lives under tests/
// on purpose: Next does not inline arbitrary server-side process.env reads, so
// an equivalent guard inside src/ would ship as live code in the production
// server bundle. Absence at build time beats any runtime check.
//
// Loaded two ways, because two processes issue queries:
//   - the app server, via NODE_OPTIONS=--import in playwright.config.ts
//   - the Playwright process, imported by playwright.config.ts itself
//
// Two separate mechanisms below, for two different processes — neither
// replaces the other:
//   - `neonConfig.fetchEndpoint` serves the Playwright process directly:
//     nothing there is bundled, so mutating this module-level singleton is
//     enough (manage-early-access.spec.ts builds its own neon() client from
//     this exact, unbundled copy of the package).
//   - `globalThis.fetch` serves the app server. Next's production build
//     inlines its own copy of @neondatabase/serverless into the compiled
//     server chunks, so the `neonConfig` mutation below runs without error
//     but never reaches *that* copy's `neonConfig` — the driver's queries
//     kept going to the real default endpoint even with the override loaded
//     and active (confirmed by instrumenting `fetch` itself: see
//     .superpowers/sdd/2026-09-08-e2e-container-runtime/task-3-report.md).
//     `fetch` is a genuine process-wide global, so every copy of the driver,
//     bundled or not, ultimately calls the exact same function — patching it
//     is the one place a module-level singleton mutation can't be defeated
//     by bundling.
import { neonConfig } from '@neondatabase/serverless';

const endpoint = process.env.E2E_NEON_HTTP_ENDPOINT;
if (endpoint) {
  // fetchEndpoint is a module-level singleton: set once, it applies to every
  // subsequent neon() call made through *this* process's copy of the
  // package — see the Playwright-process half of the comment above.
  const defaultFetchEndpoint = neonConfig.fetchEndpoint;
  neonConfig.fetchEndpoint = endpoint;

  // The fetch patch below needs a database host to derive the driver's
  // default endpoint from, and needs that default to still be a function
  // (its shape as of @neondatabase/serverless@1.1.0). package.json pins
  // this dependency with a caret, so a routine bump could change either
  // without anyone touching this file. Failing loudly here — instead of
  // quietly skipping the patch — is the only way a shape change doesn't
  // regress straight back to the bug this file exists to fix: the app
  // server's queries silently reaching the real Neon API instead of the
  // local proxy, surfacing as a generic "couldn't complete signup" error
  // nowhere near here (see the Task 3 report for how long that took to
  // trace the first time).
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) {
    throw new Error(
      'E2E_NEON_HTTP_ENDPOINT is set but DATABASE_URL and DATABASE_URL_UNPOOLED are both ' +
        'unset, so there is no host to derive the app server default Neon endpoint from. ' +
        'Without that, the fetch patch cannot be installed and the app server would silently ' +
        'query the real Neon API instead of the local proxy for the rest of this run.',
    );
  }
  if (typeof defaultFetchEndpoint !== 'function') {
    throw new Error(
      `E2E_NEON_HTTP_ENDPOINT is set but @neondatabase/serverless's default fetchEndpoint is ` +
        `a ${typeof defaultFetchEndpoint}, not a function (package.json pins this dependency ` +
        'with a caret, so a routine bump can change this). The fetch patch cannot compute the ' +
        'URL to redirect, so the app server would silently query the real Neon API instead of ' +
        'the local proxy — update this file to match the new shape before trusting an E2E run ' +
        'again.',
    );
  }

  const { hostname, port } = new URL(databaseUrl);
  // The driver always calls `fetchEndpoint(host, port, { jwtAuth })` itself
  // to build the URL it requests, with `jwtAuth` reflecting whether an auth
  // token was supplied. Reuse its own (unmodified) default builder rather
  // than reimplementing its hostname rewrite rules ourselves, and pass
  // `jwtAuth: false` explicitly — nothing in this repo authenticates Neon
  // HTTP queries with a JWT — so the call genuinely matches the driver's,
  // not just in the cases that happen to produce the same URL either way.
  const defaultUrl = defaultFetchEndpoint(hostname, port, { jwtAuth: false });

  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    // fetch() accepts a string, a URL, or a Request; the driver only ever
    // calls it as fetch(urlString, init), but read the URL generically so
    // this doesn't silently miss a Request-shaped call.
    const url = input instanceof Request ? input.url : String(input);

    // Exact match only: this process also makes other requests (health
    // checks, Playwright's own traffic in-process, etc.) that must reach
    // their real destinations untouched — a broad rewrite would mask a
    // genuine networking failure instead of surfacing it.
    if (url !== defaultUrl) return realFetch(input, init);

    // Preserve the request faithfully: forward whichever form arrived,
    // rewriting only the destination URL, so method/headers/body pass
    // through exactly as the driver sent them.
    return input instanceof Request
      ? realFetch(new Request(endpoint, input), init)
      : realFetch(endpoint, init);
  };
}
