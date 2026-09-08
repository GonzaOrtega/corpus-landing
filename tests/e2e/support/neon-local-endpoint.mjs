// The ONLY place the Neon HTTP endpoint is redirected. It lives under tests/
// on purpose: Next does not inline arbitrary server-side process.env reads, so
// an equivalent guard inside src/ would ship as live code in the production
// server bundle. Absence at build time beats any runtime check.
//
// Loaded two ways, because two processes issue queries:
//   - the app server, via NODE_OPTIONS=--import in playwright.config.ts
//   - the Playwright process, imported by playwright.config.ts itself
import { neonConfig } from '@neondatabase/serverless';

const endpoint = process.env.E2E_NEON_HTTP_ENDPOINT;
if (endpoint) {
  // fetchEndpoint is a module-level singleton: set once, it applies to every
  // subsequent neon() call in this process.
  neonConfig.fetchEndpoint = endpoint;
}
