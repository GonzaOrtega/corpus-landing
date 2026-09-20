import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from './sitemap';

describe('sitemap route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists the six public pages on the production deployment', () => {
    vi.stubEnv('SITE_URL', 'https://corpus.example');
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(sitemap().map((entry) => entry.url)).toEqual([
      'https://corpus.example/',
      'https://corpus.example/about',
      'https://corpus.example/contact',
      'https://corpus.example/developers',
      'https://corpus.example/privacy',
      'https://corpus.example/terms',
    ]);
  });

  it('is empty anywhere else so previews never leak into discovery', () => {
    vi.stubEnv('SITE_URL', 'https://preview.corpus.example');
    vi.stubEnv('VERCEL_ENV', 'preview');

    expect(sitemap()).toEqual([]);
  });
});
