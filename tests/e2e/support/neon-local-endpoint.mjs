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

  // Only patch `fetch` if there's a database URL to derive the expected
  // default endpoint from — with nothing to compute an exact match against,
  // there is nothing safe to redirect, so leave `fetch` untouched entirely.
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
  if (databaseUrl && typeof defaultFetchEndpoint === 'function') {
    const { hostname, port } = new URL(databaseUrl);
    // The driver itself calls `fetchEndpoint(host, port, { jwtAuth })` to
    // build the URL it requests. Reuse its own (unmodified) default builder
    // with our configured host, rather than reimplementing its hostname
    // rewrite rules ourselves — this keeps matching whatever the installed
    // package version actually does; only the host is ours.
    const defaultUrl = defaultFetchEndpoint(hostname, port);

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
}
