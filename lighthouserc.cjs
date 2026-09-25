/** @type {import('@lhci/cli/src/types').LHCIConfig} */
const previewUrl = process.env.LHCI_URL;
const isPreview = process.env.LHCI_DEPLOYMENT_ENV === 'preview';
// Preview deployments are behind Vercel Authentication; without the bypass
// Lighthouse would score the login page. Unset for local/default runs.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

// Local/default runs start `bun run start` (no build step here — whatever is
// already in .next/ stays as-is) against this process's own environment,
// which — same as compose.yaml's and playwright.config.ts's local production
// builds — can carry a real DSN or auth token from .env.local. @lhci/cli's
// node-runner spawns startServerCommand with no env override, so it inherits
// process.env, and mutating it here reaches that child. The SERVER SDK reads
// process.env at request time (not build time, unlike the inlined
// NEXT_PUBLIC_ client bundle), so blanking it stops this run's traffic and
// errors from reaching a real project. CI mirrors compose.yaml's e2e
// service: the same pipeline signal (spec decision 6, runtime-environment.ts)
// also keeps the notifications capability fake, and makes the /monitoring
// tunnel forward nothing. That last part matters because this run never
// rebuilds: a .next built with a real DSN ships a browser SDK that still
// posts envelopes, and only the tunnel's runtime pipeline check (not the
// blanked variable, which the build already inlined) stops them there. The
// browser SDK itself still starts and captures, so a clean run needs a
// DSN-less build too — see docs/operations/sentry.md.
if (!previewUrl) {
  Object.assign(process.env, {
    NEXT_PUBLIC_SENTRY_DSN: '',
    SENTRY_AUTH_TOKEN: '',
    CI: 'true',
  });
}

module.exports = {
  ci: {
    collect: {
      ...(previewUrl
        ? { url: [previewUrl] }
        : {
            startServerCommand: 'bun run start -- --port 3018',
            startServerReadyPattern: 'Ready',
            startServerReadyTimeout: 120000,
            url: ['http://localhost:3018/'],
          }),
      numberOfRuns: 3,
      settings: {
        // Preview must remain nonindexable; E2E asserts its robots policy.
        // Production/default runs retain the indexing audit and all score gates.
        ...(isPreview ? { skipAudits: ['is-crawlable'] } : {}),
        ...(bypassSecret
          ? {
              extraHeaders: JSON.stringify({
                'x-vercel-protection-bypass': bypassSecret,
                // Lighthouse fetches /robots.txt outside the main navigation.
                // Without the cookie that request is challenged and scores the
                // SSO page as robots.txt, which fails the SEO gate on 0.88.
                'x-vercel-set-bypass-cookie': 'true',
              }),
            }
          : {}),
        formFactor: 'mobile',
        screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1 },
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
