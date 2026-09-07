/** @type {import('@lhci/cli/src/types').LHCIConfig} */
const previewUrl = process.env.LHCI_URL;

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
