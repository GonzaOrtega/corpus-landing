import { type NextRequest, NextResponse } from 'next/server';
import { parseReleaseStage, type ReleaseStage } from '@/src/config/release-stage';
import {
  type AgentContentContext,
  type AgentPagePath,
  agentPagePaths,
  buildMarkdownNotFound,
  canonicalPathForMarkdown,
  markdownPathFor,
  renderMarkdownPage,
} from '@/src/features/agent-readiness/content';
import { negotiateRepresentation } from '@/src/features/agent-readiness/negotiation';

const agentPagePathSet = new Set<string>(agentPagePaths);

function releaseStage(): ReleaseStage {
  // Delegate to the shared parser rather than defaulting: a typo'd
  // CORPUS_RELEASE_STAGE must fail loudly here too, otherwise the HTML site
  // refuses to boot while the Markdown representation quietly serves
  // early-access copy.
  const raw = process.env.CORPUS_RELEASE_STAGE;
  return raw === undefined || raw === '' ? 'early-access' : parseReleaseStage(raw);
}

function contentContext(): AgentContentContext {
  return {
    releaseStage: releaseStage(),
    contactEmail: process.env.REPLY_TO,
    postalAddress: process.env.EMAIL_POSTAL_ADDRESS,
  };
}

function isAgentPagePath(pathname: string): pathname is AgentPagePath {
  return agentPagePathSet.has(pathname);
}

function isNextInternalRequest(request: NextRequest): boolean {
  const accept = request.headers.get('accept') ?? '';
  return (
    request.headers.get('rsc') === '1' ||
    request.headers.has('next-router-prefetch') ||
    request.headers.has('next-router-state-tree') ||
    accept.includes('text/x-component')
  );
}

function shouldBypass(pathname: string): boolean {
  if (pathname.startsWith('/early-access/manage')) return true;
  const finalSegment = pathname.split('/').at(-1) ?? '';
  return finalSegment.includes('.') && !pathname.endsWith('.md');
}

function discoveryLink(markdownPath: string): string {
  return `<${markdownPath}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`;
}

// RFC 7764 names the flavour of Markdown being served; RFC 9110 requires Vary
// to list every request header the selection depends on, and Accept-Encoding is
// added because the response is also compressed per-client.
const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8; variant=GFM';
const NEGOTIATION_VARY = 'Accept, Accept-Encoding';

function markdownResponse(body: string, status: number, method: string, link?: string): Response {
  const headers = new Headers({
    'Content-Type': MARKDOWN_CONTENT_TYPE,
    Vary: NEGOTIATION_VARY,
  });
  // A 404 body is per-request; the canonical pages are static content and can
  // be held at the edge instead of re-rendering the Proxy on every agent hit.
  if (status === 200) headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
  if (link) headers.set('Link', link);
  return new Response(method === 'HEAD' ? null : body, { status, headers });
}

function notAcceptable(method: string, markdownPath: string): Response {
  return new Response(method === 'HEAD' ? null : 'Not Acceptable', {
    status: 406,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Vary: NEGOTIATION_VARY,
      Link: discoveryLink(markdownPath),
    },
  });
}

export function proxy(request: NextRequest): Response {
  if ((request.method !== 'GET' && request.method !== 'HEAD') || isNextInternalRequest(request)) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (shouldBypass(pathname)) return NextResponse.next();

  const markdownCanonical = canonicalPathForMarkdown(pathname);
  if (markdownCanonical) {
    return markdownResponse(
      renderMarkdownPage(markdownCanonical, contentContext()),
      200,
      request.method,
      `<${markdownCanonical}>; rel="canonical", </llms.txt>; rel="describedby"`,
    );
  }

  const decision = negotiateRepresentation(request.headers.get('accept'));
  if (isAgentPagePath(pathname)) {
    const markdownPath = markdownPathFor(pathname);
    if (decision === 'markdown') {
      return markdownResponse(
        renderMarkdownPage(pathname, contentContext()),
        200,
        request.method,
        discoveryLink(markdownPath),
      );
    }
    // 406 is scoped to the negotiated pages and to clients that explicitly
    // refused HTML. Anything else — a narrow Accept from a monitor, a link
    // checker, an agent asking for JSON — gets the page rather than an error.
    if (decision === 'html-rejected') return notAcceptable(request.method, markdownPath);
    return NextResponse.next();
  }

  if (decision === 'markdown') {
    return markdownResponse(buildMarkdownNotFound(), 404, request.method);
  }
  return NextResponse.next();
}

export const config = {
  // Normal browser navigations get static discovery headers from next.config
  // and must not pay the Proxy hop. Raw HTTP clients still enter Proxy so
  // Accept negotiation, 406s and Markdown 404 recovery remain request-aware.
  // Explicit Markdown aliases are always handled, including browser navigation.
  // `monitoring` is the Sentry tunnel (app/monitoring/route.ts): SDK
  // envelopes, never a page, so negotiation has nothing to decide there.
  matcher: [
    '/index.md',
    '/about.md',
    '/contact.md',
    '/developers.md',
    '/privacy.md',
    '/terms.md',
    {
      source:
        '/((?!api|monitoring|_next|_vercel|brand|favicon.ico|robots.txt|sitemap.xml|llms.txt|opengraph-image|motion-preflight.js).*)',
      has: [{ type: 'header', key: 'accept', value: 'text/markdown' }],
    },
    {
      source:
        '/((?!api|monitoring|_next|_vercel|brand|favicon.ico|robots.txt|sitemap.xml|llms.txt|opengraph-image|motion-preflight.js).*)',
      missing: [{ type: 'header', key: 'sec-fetch-mode', value: 'navigate' }],
    },
  ],
};
