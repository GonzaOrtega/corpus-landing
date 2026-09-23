import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

/**
 * `next.config.ts` is production code: every response header the site ships
 * comes out of its `headers()`. The CSP builder has its own suite; this one
 * proves the wiring around it — which routes get which headers, and that the
 * HTTPS-only directive follows the deployment signal, not the build mode.
 */
async function headerRules(): Promise<HeaderRule[]> {
  const headers = nextConfig.headers;
  if (!headers) throw new Error('next.config.ts no longer declares headers()');
  return (await headers()) as HeaderRule[];
}

function headerValue(rule: HeaderRule, key: string): string | undefined {
  return rule.headers.find((header) => header.key === key)?.value;
}

describe('next.config headers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends the security headers on every path, with the HTTPS upgrade only on Vercel', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const [everyPath] = await headerRules();

    expect(everyPath?.source).toBe('/(.*)');
    expect(headerValue(everyPath as HeaderRule, 'Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains',
    );
    expect(headerValue(everyPath as HeaderRule, 'X-Frame-Options')).toBe('DENY');
    expect(headerValue(everyPath as HeaderRule, 'X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue(everyPath as HeaderRule, 'Content-Security-Policy')).toContain(
      'upgrade-insecure-requests',
    );
    expect(headerValue(everyPath as HeaderRule, 'Content-Security-Policy')).not.toContain(
      'unsafe-eval',
    );
  });

  it('drops the HTTPS upgrade for a plain-HTTP production build, as the E2E suite runs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', undefined);

    const [everyPath] = await headerRules();

    expect(headerValue(everyPath as HeaderRule, 'Content-Security-Policy')).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('relaxes only what the dev tooling needs in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', undefined);

    const [everyPath] = await headerRules();
    const csp = headerValue(everyPath as HeaderRule, 'Content-Security-Policy') ?? '';

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws: wss:');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('advertises the Markdown alternate and llms.txt on exactly the six negotiated pages', async () => {
    const rules = await headerRules();
    const discovery = rules.slice(1);

    expect(discovery.map((rule) => rule.source)).toEqual([
      '/',
      '/about',
      '/contact',
      '/developers',
      '/privacy',
      '/terms',
    ]);
    for (const rule of discovery) {
      const markdownPath = rule.source === '/' ? '/index.md' : `${rule.source}.md`;
      expect(headerValue(rule, 'Link')).toBe(
        `<${markdownPath}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`,
      );
    }
  });
});
