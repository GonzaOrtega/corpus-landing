import { loadSiteConfig } from '@/src/config/server-env';
import { buildLlmsTxt } from '@/src/features/agent-readiness/content';

function responseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=3600',
  };
}

export function GET(): Response {
  const config = loadSiteConfig(process.env);
  return new Response(buildLlmsTxt(config.siteUrl), { headers: responseHeaders() });
}

export function HEAD(): Response {
  return new Response(null, { headers: responseHeaders() });
}
