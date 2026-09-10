import { describe, expect, it, vi } from 'vitest';
import { runProductionSmoke, type SmokeOptions, validateSmokeOptions } from './production-smoke';

const options: SmokeOptions = {
  deploymentUrl: 'https://corpus-immutable-example.vercel.app',
  siteUrl: 'https://corpus.example/',
  releaseStage: 'launched',
  downloadUrl: 'https://downloads.corpus.example/android?a=1&b=2',
};
const html = `<!doctype html><html><head>
<meta name="robots" content="index, follow"/>
<link rel="canonical" href="https://corpus.example/"/>
<link rel="stylesheet" href="/_next/static/chunks/site.css"/>
</head><body><h1>Learn words from real life.</h1>
<a href="https://downloads.corpus.example/android?a=1&amp;b=2">Get Corpus</a>
<section id="early-access"><h2>Get Corpus.</h2></section>
</body></html>`;
const earlyAccessHtml = html
  .replace(
    '<a href="https://downloads.corpus.example/android?a=1&amp;b=2">Get Corpus</a>',
    '<a href="#early-access">Join early access</a>',
  )
  .replace(
    '<h2>Get Corpus.</h2>',
    '<h2>Be there for the first build.</h2><form class="signup-form"><input name="email" type="email"/><button type="submit">Join the list</button></form>',
  );
const security = {
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'content-security-policy':
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
};

type Fixture = { body: string; status?: number; headers?: Record<string, string> };
function fixture(overrides: Record<string, Fixture> = {}) {
  const routes: Record<string, Fixture> = {
    '/': { body: html, headers: security },
    '/_next/static/chunks/site.css': {
      body: 'body{color:black}',
      headers: { 'content-type': 'text/css' },
    },
    '/robots.txt': {
      body: 'User-Agent: *\nAllow: /\n\nSitemap: https://corpus.example/sitemap.xml\n',
      headers: { 'content-type': 'text/plain' },
    },
    '/api/cron/maintenance': { body: 'Unauthorized', status: 401 },
    ...overrides,
  };
  return vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const route = routes[new URL(input).pathname];
    if (!route) throw new Error('Unexpected request');
    return new Response(route.body, { status: route.status ?? 200, headers: route.headers });
  });
}

describe('production smoke', () => {
  it.each([undefined, '', 'unused-invalid-download'])(
    'supports early-access without a validated download URL (%s)',
    async (downloadUrl) => {
      const fetcher = fixture({ '/': { body: earlyAccessHtml, headers: security } });
      await expect(
        runProductionSmoke({ ...options, releaseStage: 'early-access', downloadUrl }, fetcher),
      ).resolves.toBeDefined();
      expect(fetcher).toHaveBeenCalledTimes(4);
      expect(
        fetcher.mock.calls.every(([, init]) => init?.method === 'GET' && init.body === undefined),
      ).toBe(true);
    },
  );

  it.each(['', 'preview', 'Early-access', 'launched '])(
    'rejects unknown or missing release stage %s',
    async (releaseStage) => {
      const fetcher = fixture();
      await expect(runProductionSmoke({ ...options, releaseStage }, fetcher)).rejects.toThrow(
        'release stage',
      );
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, ''])('requires download URL for launched (%s)', async (downloadUrl) => {
    const fetcher = fixture();
    await expect(runProductionSmoke({ ...options, downloadUrl }, fetcher)).rejects.toThrow('HTTPS');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['early-access', html],
    ['launched', earlyAccessHtml],
  ])('rejects the opposite deployed stage when expecting %s', async (releaseStage, body) => {
    await expect(
      runProductionSmoke(
        { ...options, releaseStage },
        fixture({ '/': { body, headers: security } }),
      ),
    ).rejects.toThrow();
  });

  it.each([
    ['CTA destination', earlyAccessHtml.replace('href="#early-access"', 'href="#other"')],
    ['signup heading', earlyAccessHtml.replace('Be there for the first build.', 'Other heading')],
    ['email control', earlyAccessHtml.replace('type="email"', 'type="text"')],
    ['signup button', earlyAccessHtml.replace('Join the list', 'Unavailable')],
    ['signup form', earlyAccessHtml.replace('class="signup-form"', 'class="other"')],
    [
      'mixed-stage CTA',
      earlyAccessHtml.replace(
        '</body>',
        '<a href="https://downloads.example">Get Corpus</a></body>',
      ),
    ],
  ])('rejects invalid early-access %s', async (_name, body) => {
    await expect(
      runProductionSmoke(
        { ...options, releaseStage: 'early-access', downloadUrl: undefined },
        fixture({ '/': { body, headers: security } }),
      ),
    ).rejects.toThrow();
  });

  it.each([
    ['signup form', html.replace('</section>', '<form class="signup-form"></form></section>')],
    [
      'wrong heading',
      html.replace('<h2>Get Corpus.</h2>', '<h2>Be there for the first build.</h2>'),
    ],
  ])('rejects launched page with an early-access %s', async (_name, body) => {
    await expect(
      runProductionSmoke(options, fixture({ '/': { body, headers: security } })),
    ).rejects.toThrow('Launched release surface');
  });

  it('checks the captured deployment with four GETs and never authenticates maintenance', async () => {
    const fetcher = fixture();
    const result = await runProductionSmoke(
      { ...options, bypassSecret: 'test-only-bypass' },
      fetcher,
    );
    expect(result.checks).toHaveLength(6);
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [url, init] of fetcher.mock.calls) {
      expect(new URL(url).origin).toBe(options.deploymentUrl);
      expect(init).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit' });
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBeNull();
      expect(headers.get('cookie')).toBeNull();
      expect(headers.get('x-vercel-protection-bypass')).toBe('test-only-bypass');
      expect(init?.body).toBeUndefined();
    }
  });

  it.each([
    ['deploymentUrl', 'http://corpus-example.vercel.app'],
    ['deploymentUrl', 'https://corpus.example'],
    ['deploymentUrl', 'https://corpus.vercel.app.evil.example'],
    ['deploymentUrl', 'https://corpus.vercel.app/path'],
    ['deploymentUrl', 'https://corpus.vercel.app?token=synthetic'],
    ['deploymentUrl', 'https://corpus.vercel.app:444'],
    ['siteUrl', 'https://corpus.example/path'],
    ['siteUrl', ''],
    ['downloadUrl', 'javascript:alert(1)'],
    ['downloadUrl', 'https://downloads.example/#fragment'],
  ])('rejects invalid %s before requesting anything', async (key, value) => {
    const fetcher = fixture();
    await expect(runProductionSmoke({ ...options, [key]: value }, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects userinfo without including its input in the error', () => {
    const input = new URL(options.siteUrl);
    input.username = 'synthetic-user';
    expect(() => validateSmokeOptions({ ...options, siteUrl: input.href })).toThrow(
      'Smoke URLs must use HTTPS without credentials or fragments',
    );
  });

  it.each([301, 302, 401, 403, 404, 500])('fails closed on homepage status %i', async (status) => {
    await expect(
      runProductionSmoke(options, fixture({ '/': { body: html, headers: security, status } })),
    ).rejects.toThrow('status');
  });

  it.each([
    ['heading', html.replace('Learn words from real life.', 'Deployment authentication')],
    ['CTA', html.replace('Get Corpus', 'Join early access')],
    ['destination', html.replace('downloads.corpus.example', 'other.example')],
    [
      'script-only CTA',
      html.replace('<a href=', '<script><a href=').replace('</a>', '</a></script>'),
    ],
    ['robots noindex', html.replace('index, follow', 'noindex, nofollow')],
    ['robots absent', html.replace('<meta name="robots" content="index, follow"/>', '')],
    ['canonical', html.replace('href="https://corpus.example/"', 'href="https://wrong.example/"')],
    [
      'external CSS',
      html.replace('/_next/static/chunks/site.css', 'https://other.example/site.css'),
    ],
  ])('rejects invalid rendered %s', async (_name, body) => {
    await expect(
      runProductionSmoke(options, fixture({ '/': { body, headers: security } })),
    ).rejects.toThrow();
  });

  it.each(Object.keys(security))('requires homepage header %s', async (name) => {
    const headers: Record<string, string> = { ...security };
    delete headers[name];
    await expect(
      runProductionSmoke(options, fixture({ '/': { body: html, headers } })),
    ).rejects.toThrow();
  });

  it('rejects development CSP', async () => {
    const headers = {
      ...security,
      'content-security-policy': `${security['content-security-policy']}; script-src 'unsafe-eval'`,
    };
    await expect(
      runProductionSmoke(options, fixture({ '/': { body: html, headers } })),
    ).rejects.toThrow('Unsafe');
  });

  it.each([
    [
      '/_next/static/chunks/site.css',
      { body: '<html>error</html>', headers: { 'content-type': 'text/css' } },
    ],
    ['/_next/static/chunks/site.css', { body: '', headers: { 'content-type': 'text/css' } }],
    [
      '/robots.txt',
      { body: 'User-Agent: *\nDisallow: /', headers: { 'content-type': 'text/plain' } },
    ],
    [
      '/robots.txt',
      {
        body: 'User-Agent: *\nAllow: /\nSitemap: https://preview.example/sitemap.xml',
        headers: { 'content-type': 'text/plain' },
      },
    ],
    ['/api/cron/maintenance', { body: 'Unauthorized', status: 200 }],
    ['/api/cron/maintenance', { body: '<html>Protection login</html>', status: 401 }],
  ] satisfies [string, Fixture][])('rejects unhealthy %s', async (path, response) => {
    await expect(runProductionSmoke(options, fixture({ [path]: response }))).rejects.toThrow();
  });

  it('allows platform noindex on an unaliased deployment while requiring app indexing', async () => {
    const headers = { ...security, 'x-robots-tag': 'noindex' };
    await expect(
      runProductionSmoke(options, fixture({ '/': { body: html, headers } })),
    ).resolves.toBeDefined();
  });

  it('sanitizes transport and response body read errors', async () => {
    const failed = vi.fn(async () => {
      throw new Error('sensitive transport detail');
    });
    await expect(runProductionSmoke(options, failed)).rejects.toThrow(
      'Smoke request failed or timed out',
    );
    const response = new Response('');
    vi.spyOn(response, 'text').mockRejectedValue(new Error('sensitive body detail'));
    await expect(runProductionSmoke(options, async () => response)).rejects.toThrow(
      'Smoke request failed or timed out',
    );
  });
});
