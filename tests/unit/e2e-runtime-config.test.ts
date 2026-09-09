import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

describe('E2E runtime configuration', () => {
  // A stale tag means the image ships browsers the runner does not expect, and
  // the failure surfaces as a confusing "browser not found" far from the cause.
  it('pins the Playwright image to the installed @playwright/test version', () => {
    const version = JSON.parse(read('package.json')).devDependencies['@playwright/test'];
    const expected = `v${version.replace(/[^0-9.]/g, '')}-noble`;

    expect(read('docker/e2e.Dockerfile')).toContain(`mcr.microsoft.com/playwright:${expected}`);
    expect(read('.github/workflows/preview.yml')).toContain(`corpus-landing-e2e:${expected}`);
  });

  it('pins the proxy by digest, since upstream publishes only a moving tag', () => {
    const digest = /local-neon-http-proxy@sha256:[0-9a-f]{64}/;
    expect(read('compose.yaml')).toMatch(digest);
    expect(read('.github/workflows/preview.yml')).toMatch(digest);
  });

  it('publishes Postgres only to loopback', () => {
    expect(read('compose.yaml')).toContain("'127.0.0.1:55432:5432'");
  });
});
