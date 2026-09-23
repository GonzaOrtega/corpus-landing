import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMarkdownNotFound, renderMarkdownPage } from '@/src/features/agent-readiness/content';
import { config, proxy } from './proxy';

const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const MARKDOWN_ACCEPT = 'text/markdown';
const HTML_REJECTED_ACCEPT = 'text/html;q=0, application/pdf';
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8; variant=GFM';

function request(
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(new URL(path, 'https://corpus.example'), {
    method: init.method ?? 'GET',
    headers: init.headers,
  });
}

/** NextResponse.next() is the pass-through signal Next's runtime looks for. */
function isPassThrough(response: Response): boolean {
  return response.headers.get('x-middleware-next') === '1';
}

const earlyAccessContext = { releaseStage: 'early-access' as const };

describe('proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('requests it must never intercept', () => {
    it('passes through anything other than GET or HEAD', () => {
      expect(isPassThrough(proxy(request('/about', { method: 'POST' })))).toBe(true);
    });

    it.each([
      ['an RSC request', { rsc: '1' }],
      ['a router prefetch', { 'next-router-prefetch': '1' }],
      ['a router state tree', { 'next-router-state-tree': '%5B%5D' }],
      ['a flight component request', { accept: 'text/x-component' }],
    ])('passes through %s even when it targets a negotiated page', (_label, headers) => {
      expect(isPassThrough(proxy(request('/about', { headers })))).toBe(true);
    });

    it('passes through a request with no Accept header at all', () => {
      expect(isPassThrough(proxy(request('/about')))).toBe(true);
    });

    it('bypasses the management surface and static assets, but not Markdown aliases', () => {
      expect(
        isPassThrough(
          proxy(request('/early-access/manage', { headers: { accept: MARKDOWN_ACCEPT } })),
        ),
      ).toBe(true);
      expect(
        isPassThrough(
          proxy(request('/brand/corpus-mark.svg', { headers: { accept: MARKDOWN_ACCEPT } })),
        ),
      ).toBe(true);
      expect(isPassThrough(proxy(request('/about.md')))).toBe(false);
    });
  });

  describe('explicit Markdown aliases', () => {
    it('serves the canonical page as cacheable Markdown with discovery links', async () => {
      const response = proxy(request('/about.md', { headers: { accept: BROWSER_ACCEPT } }));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(MARKDOWN_TYPE);
      expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
      expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=3600');
      expect(response.headers.get('link')).toBe(
        '</about>; rel="canonical", </llms.txt>; rel="describedby"',
      );
      expect(await response.text()).toBe(renderMarkdownPage('/about', earlyAccessContext));
    });

    it('answers HEAD with the same headers and an empty body', async () => {
      const response = proxy(request('/index.md', { method: 'HEAD' }));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(MARKDOWN_TYPE);
      expect(await response.text()).toBe('');
    });
  });

  describe('Accept negotiation on the six agent pages', () => {
    it('serves Markdown when the client prefers it and points back at the alias', async () => {
      vi.stubEnv('REPLY_TO', 'hello@corpus.example');
      vi.stubEnv('EMAIL_POSTAL_ADDRESS', '123 Example Street');

      const response = proxy(request('/contact', { headers: { accept: MARKDOWN_ACCEPT } }));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(MARKDOWN_TYPE);
      expect(response.headers.get('link')).toBe(
        '</contact.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"',
      );
      const body = await response.text();
      expect(body).toContain('hello@corpus.example');
      expect(body).toContain('123 Example Street');
    });

    it('answers 406 only when the client explicitly refuses HTML', async () => {
      const response = proxy(request('/about', { headers: { accept: HTML_REJECTED_ACCEPT } }));

      expect(response.status).toBe(406);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
      expect(response.headers.get('link')).toContain('</about.md>; rel="alternate"');
      expect(await response.text()).toBe('Not Acceptable');
    });

    it('answers HEAD 406 with an empty body', async () => {
      const response = proxy(
        request('/about', { method: 'HEAD', headers: { accept: HTML_REJECTED_ACCEPT } }),
      );

      expect(response.status).toBe(406);
      expect(await response.text()).toBe('');
    });

    it('lets a browser navigation reach the HTML page', () => {
      expect(isPassThrough(proxy(request('/about', { headers: { accept: BROWSER_ACCEPT } })))).toBe(
        true,
      );
    });
  });

  describe('paths that do not exist', () => {
    it('offers the Markdown recovery list, uncached, to a Markdown client', async () => {
      const response = proxy(request('/nowhere', { headers: { accept: MARKDOWN_ACCEPT } }));

      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toBe(MARKDOWN_TYPE);
      expect(response.headers.get('cache-control')).toBeNull();
      expect(response.headers.get('link')).toBeNull();
      expect(await response.text()).toBe(buildMarkdownNotFound());
    });

    it('leaves the HTML 404 to Next for everyone else', () => {
      expect(
        isPassThrough(proxy(request('/nowhere', { headers: { accept: BROWSER_ACCEPT } }))),
      ).toBe(true);
      expect(
        isPassThrough(proxy(request('/nowhere', { headers: { accept: HTML_REJECTED_ACCEPT } }))),
      ).toBe(true);
    });
  });

  describe('release stage', () => {
    it.each([
      ['unset', undefined],
      ['blank', ''],
    ])('renders early-access copy when CORPUS_RELEASE_STAGE is %s', async (_label, value) => {
      vi.stubEnv('CORPUS_RELEASE_STAGE', value);

      const body = await proxy(request('/index.md')).text();

      expect(body).toBe(renderMarkdownPage('/', earlyAccessContext));
    });

    it('renders launched copy once the stage flips', async () => {
      vi.stubEnv('CORPUS_RELEASE_STAGE', 'launched');

      const body = await proxy(request('/index.md')).text();

      expect(body).toBe(renderMarkdownPage('/', { releaseStage: 'launched' }));
      expect(body).toContain('Corpus has launched');
    });

    it('fails loudly on an invalid stage instead of serving stale copy', () => {
      vi.stubEnv('CORPUS_RELEASE_STAGE', 'beta');

      expect(() => proxy(request('/index.md'))).toThrow();
    });
  });

  describe('matcher', () => {
    it('lists the six Markdown aliases literally so browsers reach them too', () => {
      expect(config.matcher.slice(0, 6)).toEqual([
        '/index.md',
        '/about.md',
        '/contact.md',
        '/developers.md',
        '/privacy.md',
        '/terms.md',
      ]);
    });

    it('enters the proxy for Markdown-accepting and non-navigation requests only, skipping Next internals', () => {
      const [, , , , , , byAccept, byFetchMode] = config.matcher;
      const excluded =
        'api|monitoring|_next|_vercel|brand|favicon.ico|robots.txt|sitemap.xml|llms.txt|opengraph-image|motion-preflight.js';

      expect(byAccept).toEqual({
        source: `/((?!${excluded}).*)`,
        has: [{ type: 'header', key: 'accept', value: 'text/markdown' }],
      });
      expect(byFetchMode).toEqual({
        source: `/((?!${excluded}).*)`,
        missing: [{ type: 'header', key: 'sec-fetch-mode', value: 'navigate' }],
      });
    });
  });
});
