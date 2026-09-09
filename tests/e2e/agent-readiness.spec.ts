import { expect, test } from '@playwright/test';

function headerTokens(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function visibleTextFromHtml(html: string): string {
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

test('agent-readiness public contract', async ({ request }) => {
  const markdownHome = await request.get('/', {
    headers: { accept: 'text/markdown, text/html;q=0.8' },
  });
  expect.soft(markdownHome.status(), 'Markdown home status').toBe(200);
  expect
    .soft(markdownHome.headers()['content-type'], 'Markdown home Content-Type')
    .toContain('text/markdown; charset=utf-8');
  expect.soft(headerTokens(markdownHome.headers().vary), 'Markdown home Vary').toContain('accept');
  const markdownHomeBody = await markdownHome.text();
  expect.soft(markdownHomeBody, 'Markdown home heading').toContain('# Corpus');
  expect
    .soft(markdownHomeBody, 'Markdown home product copy')
    .toContain('Learn words from real life');

  const htmlHome = await request.get('/', {
    headers: { accept: 'text/html, text/markdown;q=0.2' },
  });
  expect.soft(htmlHome.status(), 'HTML home status').toBe(200);
  expect.soft(htmlHome.headers()['content-type'], 'HTML home Content-Type').toContain('text/html');
  expect.soft(headerTokens(htmlHome.headers().vary), 'HTML home Vary').toContain('accept');
  const homeLink = htmlHome.headers().link ?? '';
  expect
    .soft(homeLink, 'Markdown alternate discovery')
    .toContain('</index.md>; rel="alternate"; type="text/markdown"');
  expect.soft(homeLink, 'llms.txt discovery').toContain('</llms.txt>; rel="describedby"');

  const htmlWhenMarkdownRejected = await request.get('/', {
    headers: { accept: 'text/markdown;q=0, text/html;q=1, */*;q=0.1' },
  });
  expect.soft(htmlWhenMarkdownRejected.status(), 'q=0 Markdown rejection status').toBe(200);
  expect
    .soft(htmlWhenMarkdownRejected.headers()['content-type'], 'q=0 Markdown rejection type')
    .toContain('text/html');

  const unsupported = await request.get('/', {
    headers: { accept: 'application/pdf' },
  });
  expect.soft(unsupported.status(), 'unsatisfiable Accept status').toBe(406);
  expect.soft(headerTokens(unsupported.headers().vary), '406 Vary').toContain('accept');

  const markdownSibling = await request.get('/index.md');
  expect.soft(markdownSibling.status(), 'Markdown sibling status').toBe(200);
  expect
    .soft(markdownSibling.headers()['content-type'], 'Markdown sibling Content-Type')
    .toContain('text/markdown; charset=utf-8');
  expect.soft(await markdownSibling.text(), 'Markdown sibling body').toContain('# Corpus');

  const missing = await request.get('/agent-route-that-does-not-exist', {
    headers: { accept: 'text/markdown' },
  });
  expect.soft(missing.status(), 'Markdown missing-route status').toBe(404);
  expect
    .soft(missing.headers()['content-type'], 'Markdown missing-route Content-Type')
    .toContain('text/markdown; charset=utf-8');
  const missingBody = await missing.text();
  for (const recoveryTarget of ['/', '/sitemap.xml', '/llms.txt', '/developers']) {
    expect.soft(missingBody, `404 recovery link ${recoveryTarget}`).toContain(recoveryTarget);
  }

  const llms = await request.get('/llms.txt');
  expect.soft(llms.status(), 'llms.txt status').toBe(200);
  expect.soft(llms.headers()['content-type'], 'llms.txt Content-Type').toContain('text/markdown');
  const llmsBody = await llms.text();
  expect.soft(llmsBody.startsWith('# Corpus\n\n> '), 'llms.txt v2 opening').toBe(true);
  expect.soft(llmsBody, 'llms.txt when-to-use guidance').toContain('## When to use Corpus');
  expect.soft(llmsBody, 'llms.txt developer resources').toContain('/developers');
  expect.soft(llmsBody, 'llms.txt trust resources').toContain('/about');
  expect.soft(llmsBody, 'llms.txt contact resources').toContain('/contact');

  for (const [path, heading] of [
    ['/about', 'About Corpus'],
    ['/contact', 'Contact Corpus'],
    ['/privacy', 'Privacy'],
    ['/developers', 'Corpus Developer Resources'],
  ] as const) {
    const response = await request.get(path, { headers: { accept: 'text/html' } });
    expect.soft(response.status(), `${path} status`).toBe(200);
    const html = await response.text();
    const visibleText = visibleTextFromHtml(html);
    expect.soft(visibleText, `${path} heading`).toContain(heading);
    if (path !== '/developers') {
      expect.soft(visibleText.length, `${path} trust-content length`).toBeGreaterThanOrEqual(500);
    }
  }

  const developers = await request.get('/developers', { headers: { accept: 'text/html' } });
  const developerText = visibleTextFromHtml(await developers.text()).toLowerCase();
  for (const currentLimitation of ['no public api', 'no public sdk', 'no public mcp server']) {
    expect
      .soft(developerText, `Developer limitation: ${currentLimitation}`)
      .toContain(currentLimitation);
  }

  const sitemap = await request.get('/sitemap.xml');
  expect.soft(sitemap.status(), 'sitemap status').toBe(200);
  const sitemapBody = await sitemap.text();
  for (const path of ['/about', '/contact', '/developers', '/privacy', '/terms']) {
    expect.soft(sitemapBody, `sitemap entry ${path}`).toContain(path);
  }

  const homeHtml = await htmlHome.text();
  const jsonLdBodies = [
    ...homeHtml.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((match) => match[1]);
  expect.soft(jsonLdBodies.length, 'homepage JSON-LD script count').toBeGreaterThan(0);
  if (jsonLdBodies.length > 0) {
    const graph = jsonLdBodies.flatMap((body) => {
      const parsed = JSON.parse(body) as { '@graph'?: Array<Record<string, unknown>> };
      return parsed['@graph'] ?? [];
    });
    const application = graph.find((entry) => entry['@type'] === 'SoftwareApplication');
    const organization = graph.find((entry) => entry['@type'] === 'Organization');
    expect.soft(application, 'SoftwareApplication JSON-LD').toMatchObject({ name: 'Corpus' });
    expect.soft(organization, 'Organization JSON-LD').toMatchObject({ name: 'Corpus' });
    expect.soft(organization?.contactPoint, 'Organization contactPoint').toBeTruthy();
    expect.soft(organization?.address, 'Organization address').toBeTruthy();
  }
});
