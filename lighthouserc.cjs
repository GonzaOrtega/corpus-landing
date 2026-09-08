/** @type {import('@lhci/cli/src/types').LHCIConfig} */
const previewUrl = process.env.LHCI_URL;
const isPreview = process.env.LHCI_DEPLOYMENT_ENV === 'preview';
// Preview deployments are behind Vercel Authentication; without the bypass
// Lighthouse would score the login page. Unset for local/default runs.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

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
          ? { extraHeaders: JSON.stringify({ 'x-vercel-protection-bypass': bypassSecret }) }
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
