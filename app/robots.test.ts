import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from './robots';

describe('robots.txt route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows crawling and points at the sitemap on the production deployment', () => {
    vi.stubEnv('SITE_URL', 'https://corpus.example');
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://corpus.example/sitemap.xml',
    });
  });

  it.each([['preview'], [undefined]])('disallows everything when VERCEL_ENV is %s', (vercelEnv) => {
    vi.stubEnv('SITE_URL', 'https://preview.corpus.example');
    vi.stubEnv('VERCEL_ENV', vercelEnv);

    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});
