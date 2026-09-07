export interface SmokeOptions {
  deploymentUrl: string;
  siteUrl: string;
  releaseStage: string;
  downloadUrl?: string;
  bypassSecret?: string;
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function requireCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function httpsUrl(value: string | undefined): URL {
  // Never interpolate untrusted values: URL parser errors can contain credentials.
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new Error('Smoke URLs must be valid HTTPS URLs');
  }
  requireCheck(
    url.protocol === 'https:' && !url.username && !url.password && !url.hash,
    'Smoke URLs must use HTTPS without credentials or fragments',
  );
  return url;
}

export function validateSmokeOptions(options: SmokeOptions): void {
  requireCheck(
    options.releaseStage === 'early-access' || options.releaseStage === 'launched',
    'Expected release stage must be early-access or launched',
  );
  const deployment = httpsUrl(options.deploymentUrl);
  const site = httpsUrl(options.siteUrl);
  if (options.releaseStage === 'launched') httpsUrl(options.downloadUrl);
  requireCheck(
    /^[a-z0-9-]+\.vercel\.app$/.test(deployment.hostname) &&
      !deployment.port &&
      deployment.pathname === '/' &&
      !deployment.search,
    'Smoke requires the captured Vercel deployment origin',
  );
  requireCheck(site.pathname === '/' && !site.search, 'Production site URL must be an origin');
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
}

function attribute(tag: string, name: string): string | undefined {
  const value = tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'))?.[1];
  return value === undefined ? undefined : decodeAttribute(value);
}

function securityHeaders(headers: Headers): void {
  const expected = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };
  for (const [name, value] of Object.entries(expected)) {
    requireCheck(headers.get(name) === value, `Missing or incorrect security header: ${name}`);
  }
  requireCheck(
    /^max-age=63072000;\s*includeSubDomains$/i.test(headers.get('strict-transport-security') ?? ''),
    'Missing or incorrect HSTS',
  );
  const csp = headers.get('content-security-policy') ?? '';
  const directives = csp.split(';').map((directive) => directive.trim());
  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ]) {
    requireCheck(directives.includes(directive), 'Missing production CSP directive');
  }
  requireCheck(!csp.includes('unsafe-eval') && !csp.includes('*'), 'Unsafe production CSP');
}

/** Four GETs only. No cookies, Authorization, signup actions or subscriber tokens. */
export async function runProductionSmoke(options: SmokeOptions, fetcher: Fetch = fetch) {
  validateSmokeOptions(options);
  const origin = new URL(options.deploymentUrl).origin;
  const headers: Record<string, string> = { 'user-agent': 'corpus-production-smoke' };
  if (options.bypassSecret) headers['x-vercel-protection-bypass'] = options.bypassSecret;

  async function get(path: string, status: number, contentType?: string) {
    let response: Response;
    let body: string;
    try {
      response = await fetcher(new URL(path, origin), {
        method: 'GET',
        headers,
        redirect: 'manual',
        credentials: 'omit',
        signal: AbortSignal.timeout(15_000),
      });
      body = await response.text();
    } catch {
      throw new Error('Smoke request failed or timed out');
    }
    requireCheck(
      response.status === status,
      'Unexpected smoke response status (redirects forbidden)',
    );
    if (contentType) {
      requireCheck(
        response.headers.get('content-type')?.split(';')[0].trim() === contentType,
        'Unexpected smoke response content type',
      );
    }
    return { headers: response.headers, body };
  }

  const home = await get('/', 200, 'text/html');
  securityHeaders(home.headers);
  // Inspect rendered markup, never text hidden in React flight/script payloads.
  const html = home.body.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<!--[\s\S]*?-->/gi, '');
  requireCheck(
    /<h1\b[^>]*>\s*Learn words from real life\.\s*<\/h1>/i.test(html),
    'Homepage heading missing',
  );
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const section = (html.match(/<section\b[^>]*>[\s\S]*?<\/section>/gi) ?? []).find(
    (tag) => attribute(tag, 'id') === 'early-access',
  );
  requireCheck(section, 'Release-stage section missing');
  const signupForm = (section.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) ?? []).find((tag) =>
    attribute(tag, 'class')?.split(/\s+/).includes('signup-form'),
  );
  if (options.releaseStage === 'launched') {
    requireCheck(
      anchors.some(
        (tag) =>
          attribute(tag, 'href') === httpsUrl(options.downloadUrl).href &&
          />\s*Get Corpus\s*<\/a>$/i.test(tag),
      ),
      'Launched download CTA missing or incorrect',
    );
    requireCheck(!/>\s*Join early access\s*</i.test(html), 'Early-access CTA still rendered');
    requireCheck(
      /<h2\b[^>]*>\s*Get Corpus\.\s*<\/h2>/i.test(section) && !signupForm,
      'Launched release surface is incorrect',
    );
  } else {
    requireCheck(
      anchors.some(
        (tag) =>
          attribute(tag, 'href') === '#early-access' && />\s*Join early access\s*<\/a>$/i.test(tag),
      ),
      'Early-access CTA missing or incorrect',
    );
    requireCheck(!/>\s*Get Corpus\s*</i.test(html), 'Launched CTA still rendered');
    requireCheck(
      /<h2\b[^>]*>\s*Be there for the first build\.\s*<\/h2>/i.test(section) && signupForm,
      'Early-access signup surface missing',
    );
    requireCheck(
      (signupForm.match(/<input\b[^>]*>/gi) ?? []).some(
        (tag) => attribute(tag, 'name') === 'email' && attribute(tag, 'type') === 'email',
      ) && /<button\b[^>]*>\s*Join the list\s*<\/button>/i.test(signupForm),
      'Early-access signup controls missing',
    );
  }
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const robots = metas.filter((tag) => /^(robots|googlebot)$/i.test(attribute(tag, 'name') ?? ''));
  requireCheck(
    robots.length > 0 &&
      robots.every((tag) => /^index,\s*follow$/i.test(attribute(tag, 'content') ?? '')),
    'Production robots metadata must allow index and follow',
  );
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  requireCheck(
    links.some(
      (tag) =>
        attribute(tag, 'rel') === 'canonical' &&
        attribute(tag, 'href') === new URL(options.siteUrl).href,
    ),
    'Production canonical URL missing or incorrect',
  );
  const stylesheet = links.find((tag) => attribute(tag, 'rel') === 'stylesheet');
  const asset = stylesheet && attribute(stylesheet, 'href');
  requireCheck(
    asset && /^\/_next\/static\/[a-zA-Z0-9_./-]+\.css(?:\?[^#]*)?$/.test(asset),
    'Critical same-origin stylesheet missing',
  );
  // Keep protection credentials on the captured deployment, even if markup is compromised.
  requireCheck(new URL(asset, origin).origin === origin, 'Static asset escaped deployment origin');
  const css = await get(asset, 200, 'text/css');
  requireCheck(
    css.body.includes('{') && !/<html|<!doctype/i.test(css.body),
    'Empty or invalid CSS',
  );

  const discovery = await get('/robots.txt', 200, 'text/plain');
  const lines = discovery.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  requireCheck(
    lines.length === 3 &&
      lines[0].toLowerCase() === 'user-agent: *' &&
      lines[1].toLowerCase() === 'allow: /' &&
      lines[2] === `Sitemap: ${new URL('/sitemap.xml', options.siteUrl).href}`,
    'Production robots.txt policy or sitemap URL is incorrect',
  );
  // This route checks Authorization before calling maintenance.execute.
  // Never add a cron bearer token: an authorized GET would mutate state/send mail.
  const boundary = await get('/api/cron/maintenance', 401);
  requireCheck(boundary.body === 'Unauthorized', 'Maintenance authorization boundary is unhealthy');
  return {
    checks: [
      'homepage',
      'release-stage-surface',
      'security-headers',
      'static-css',
      'indexing',
      'server-boundary',
    ],
  };
}

if (import.meta.main) {
  const options: SmokeOptions = {
    deploymentUrl: process.env.DEPLOY_URL ?? 'https://validate-only.vercel.app',
    siteUrl: process.env.SMOKE_SITE_URL ?? '',
    releaseStage: process.env.SMOKE_RELEASE_STAGE ?? '',
    downloadUrl: process.env.SMOKE_DOWNLOAD_URL ?? '',
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  };
  try {
    if (process.argv[2] === '--validate') {
      validateSmokeOptions(options);
    } else {
      requireCheck(process.env.DEPLOY_URL, 'Captured deployment URL is required');
      const result = await runProductionSmoke(options);
      console.info(`Production smoke passed: ${result.checks.join(', ')}`);
    }
  } catch {
    // Transport, headers, HTML and environment data never enter CI logs.
    console.error(
      'Production smoke failed; verify release configuration and staged deployment privately',
    );
    process.exitCode = 1;
  }
}
