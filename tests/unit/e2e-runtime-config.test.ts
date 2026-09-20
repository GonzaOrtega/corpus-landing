import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

describe('E2E runtime configuration', () => {
  it('exposes only the four supported developer test commands', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;

    expect(
      Object.keys(scripts)
        .filter((name) => name === 'test' || name.startsWith('test:'))
        .sort(),
    ).toEqual(['test', 'test:all', 'test:coverage', 'test:e2e']);
    expect(scripts).toMatchObject({
      test: 'vitest run',
      'test:coverage': 'vitest run --coverage',
      'test:e2e': `sh -c 'trap "docker compose down" EXIT; docker compose run --rm e2e'`,
      'test:all': 'bun run check && bun run test:coverage && bun run test:e2e',
    });
    for (const retired of ['e2e', 'e2e:local', 'e2e:migrate']) {
      expect(scripts).not.toHaveProperty(retired);
    }
  });

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
