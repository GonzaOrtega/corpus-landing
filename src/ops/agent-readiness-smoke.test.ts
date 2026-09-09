import { describe, expect, it, vi } from 'vitest';
import { runAgentReadinessSmoke } from './agent-readiness-smoke';

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'SoftwareApplication', name: 'Corpus' },
    {
      '@type': 'Organization',
      name: 'Corpus',
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support' },
      address: { '@type': 'PostalAddress' },
    },
  ],
});
const homeBody = `<html><head><script type="application/ld+json">${jsonLd}</script></head><body>Corpus</body></html>`;
const homeHeaders = new Headers({
  'content-type': 'text/html; charset=utf-8',
  vary: 'Accept, RSC',
  link: '</index.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"',
});
const longText = 'Corpus public trust information. '.repeat(30);

function fetcher(overrides: Record<string, Response> = {}) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    const accept = new Headers(init?.headers).get('accept');
    const key = `${url.pathname}|${accept ?? ''}`;
    if (overrides[key]) return overrides[key].clone();
    if (overrides[url.pathname]) return overrides[url.pathname].clone();

    if (url.pathname === '/' && accept === 'text/markdown') {
      return new Response('# Corpus\n\nLearn words from real life.', {
        headers: { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept' },
      });
    }
    if (url.pathname === '/' && accept === 'application/pdf') {
      return new Response('Not Acceptable', {
        status: 406,
        headers: { 'content-type': 'text/plain; charset=utf-8', vary: 'Accept' },
      });
    }
    if (url.pathname === '/llms.txt') {
      return new Response('# Corpus\n\n> Vocabulary from real life.\n\n## When to use Corpus\n', {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    }
    if (url.pathname === '/sitemap.xml') {
      return new Response(
        '<urlset><loc>/about</loc><loc>/contact</loc><loc>/developers</loc><loc>/privacy</loc><loc>/terms</loc></urlset>',
        { headers: { 'content-type': 'application/xml' } },
      );
    }
    if (url.pathname === '/agent-route-that-does-not-exist') {
      return new Response('# 404\n/\n/sitemap.xml\n/llms.txt\n/developers', {
        status: 404,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    }
    const htmlHeadings: Record<string, string> = {
      '/about': 'About Corpus',
      '/contact': 'Contact Corpus',
      '/developers': 'Corpus Developer Resources',
      '/privacy': 'Privacy',
      '/terms': 'Terms',
    };
    if (htmlHeadings[url.pathname]) {
      return new Response(
        `<html><body><h1>${htmlHeadings[url.pathname]}</h1>${longText}</body></html>`,
        {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      );
    }
    const markdownHeadings: Record<string, string> = {
      '/index.md': '# Corpus',
      '/about.md': '# About Corpus',
      '/contact.md': '# Contact Corpus',
      '/developers.md': '# Corpus Developer Resources',
      '/privacy.md': '# Privacy',
      '/terms.md': '# Terms',
    };
    if (markdownHeadings[url.pathname]) {
      return new Response(markdownHeadings[url.pathname], {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    }
    throw new Error('Unexpected request');
  });
}

const options = {
  origin: 'https://corpus-immutable-example.vercel.app',
  siteUrl: 'https://corpus.example/',
  headers: { 'user-agent': 'corpus-production-smoke' },
  home: { headers: homeHeaders, body: homeBody },
};

describe('agent-readiness production smoke', () => {
  it('verifies every public agent surface with safe GET requests', async () => {
    const mock = fetcher();
    await expect(runAgentReadinessSmoke(options, mock)).resolves.toBeUndefined();
    expect(mock).toHaveBeenCalledTimes(16);
    expect(
      mock.mock.calls.every(([, init]) =>
        Boolean(init?.method === 'GET' && init.body === undefined && init.credentials === 'omit'),
      ),
    ).toBe(true);
  });

  it('fails if the deployed HTML response does not vary by Accept', async () => {
    await expect(
      runAgentReadinessSmoke({
        ...options,
        home: { ...options.home, headers: new Headers({ link: homeHeaders.get('link') ?? '' }) },
      }),
    ).rejects.toThrow('Vary');
  });

  it('fails closed on an incomplete llms.txt', async () => {
    const mock = fetcher({
      '/llms.txt': new Response('# Corpus\n', {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      }),
    });
    await expect(runAgentReadinessSmoke(options, mock)).rejects.toThrow('llms.txt');
  });

  it('sanitizes transport failures', async () => {
    const mock = vi.fn(async () => {
      throw new Error('sensitive transport detail');
    });
    await expect(runAgentReadinessSmoke(options, mock)).rejects.toThrow(
      'Agent-readiness smoke request failed or timed out',
    );
  });
});
