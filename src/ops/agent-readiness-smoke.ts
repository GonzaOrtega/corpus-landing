export interface AgentReadinessSmokeOptions {
  origin: string;
  siteUrl: string;
  headers: Record<string, string>;
  home: { headers: Headers; body: string };
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function requireCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function varyIncludesAccept(headers: Headers): boolean {
  return (headers.get('vary') ?? '')
    .split(',')
    .some((token) => token.trim().toLowerCase() === 'accept');
}

function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function verifyJsonLd(html: string): void {
  const bodies = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ].map((match) => match[1]);
  requireCheck(bodies.length > 0, 'Corpus JSON-LD missing');

  const graph = bodies.flatMap((body) => {
    let parsed: { '@graph'?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(body) as { '@graph'?: Array<Record<string, unknown>> };
    } catch {
      throw new Error('Corpus JSON-LD is invalid');
    }
    return parsed['@graph'] ?? [];
  });
  const application = graph.find((entry) => entry['@type'] === 'SoftwareApplication');
  const organization = graph.find((entry) => entry['@type'] === 'Organization');
  requireCheck(application?.name === 'Corpus', 'SoftwareApplication JSON-LD missing');
  requireCheck(organization?.name === 'Corpus', 'Organization JSON-LD missing');
  requireCheck(organization.contactPoint, 'Organization contactPoint missing');
  requireCheck(organization.address, 'Organization address missing');
}

export async function runAgentReadinessSmoke(
  options: AgentReadinessSmokeOptions,
  fetcher: Fetch = fetch,
): Promise<void> {
  requireCheck(varyIncludesAccept(options.home.headers), 'HTML response must Vary by Accept');
  const link = options.home.headers.get('link') ?? '';
  requireCheck(
    link.includes('</index.md>; rel="alternate"; type="text/markdown"'),
    'Markdown alternate discovery missing',
  );
  requireCheck(link.includes('</llms.txt>; rel="describedby"'), 'llms.txt discovery missing');
  verifyJsonLd(options.home.body);

  async function get(
    path: string,
    status: number,
    contentType?: string,
    requestHeaders: Record<string, string> = {},
  ): Promise<{ headers: Headers; body: string }> {
    let response: Response;
    let body: string;
    try {
      response = await fetcher(new URL(path, options.origin), {
        method: 'GET',
        headers: { ...options.headers, ...requestHeaders },
        redirect: 'manual',
        credentials: 'omit',
        signal: AbortSignal.timeout(15_000),
      });
      body = await response.text();
    } catch {
      throw new Error('Agent-readiness smoke request failed or timed out');
    }
    requireCheck(response.status === status, 'Unexpected agent-readiness response status');
    if (contentType) {
      requireCheck(
        response.headers.get('content-type')?.split(';')[0].trim() === contentType,
        'Unexpected agent-readiness response content type',
      );
    }
    return { headers: response.headers, body };
  }

  const markdownHome = await get('/', 200, 'text/markdown', { accept: 'text/markdown' });
  requireCheck(varyIncludesAccept(markdownHome.headers), 'Markdown response must Vary by Accept');
  requireCheck(markdownHome.body.includes('# Corpus'), 'Markdown homepage missing Corpus heading');

  const unsupported = await get('/', 406, 'text/plain', { accept: 'application/pdf' });
  requireCheck(varyIncludesAccept(unsupported.headers), '406 response must Vary by Accept');

  const llms = await get('/llms.txt', 200, 'text/markdown');
  requireCheck(llms.body.startsWith('# Corpus\n\n> '), 'llms.txt opening is invalid');
  requireCheck(
    llms.body.includes('## When to use Corpus'),
    'llms.txt when-to-use guidance missing',
  );

  const sitemap = await get('/sitemap.xml', 200, 'application/xml');
  for (const path of ['/about', '/contact', '/developers', '/privacy', '/terms']) {
    requireCheck(sitemap.body.includes(path), 'Production sitemap is missing a public page');
  }

  const missing = await get('/agent-route-that-does-not-exist', 404, 'text/markdown', {
    accept: 'text/markdown',
  });
  for (const recovery of ['/', '/sitemap.xml', '/llms.txt', '/developers']) {
    requireCheck(missing.body.includes(recovery), 'Markdown 404 recovery guidance missing');
  }

  const htmlPages = [
    ['/about', 'About Corpus'],
    ['/contact', 'Contact Corpus'],
    ['/developers', 'Corpus Developer Resources'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
  ] as const;
  for (const [path, heading] of htmlPages) {
    const page = await get(path, 200, 'text/html', { accept: 'text/html' });
    requireCheck(visibleText(page.body).includes(heading), 'Public page heading missing');
    if (path === '/about' || path === '/contact' || path === '/privacy') {
      requireCheck(visibleText(page.body).length >= 500, 'Trust page content is too short');
    }
  }

  const markdownPages = [
    ['/index.md', '# Corpus'],
    ['/about.md', '# About Corpus'],
    ['/contact.md', '# Contact Corpus'],
    ['/developers.md', '# Corpus Developer Resources'],
    ['/privacy.md', '# Privacy'],
    ['/terms.md', '# Terms'],
  ] as const;
  for (const [path, heading] of markdownPages) {
    const page = await get(path, 200, 'text/markdown');
    requireCheck(page.body.includes(heading), 'Markdown public page heading missing');
  }

  requireCheck(
    new URL(options.siteUrl).protocol === 'https:',
    'Production site URL must use HTTPS',
  );
}
