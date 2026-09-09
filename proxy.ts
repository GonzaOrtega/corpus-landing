import { type NextRequest, NextResponse } from 'next/server';
import type { ReleaseStage } from '@/src/config/release-stage';
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
  return process.env.CORPUS_RELEASE_STAGE === 'launched' ? 'launched' : 'early-access';
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
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/_vercel/') ||
    pathname.startsWith('/brand/') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/llms.txt' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/opengraph-image') ||
    pathname === '/motion-preflight.js' ||
    pathname.startsWith('/early-access/manage')
  ) {
    return true;
  }

  const finalSegment = pathname.split('/').at(-1) ?? '';
  return finalSegment.includes('.') && !pathname.endsWith('.md');
}

function discoveryLink(markdownPath: string): string {
  return `<${markdownPath}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`;
}

function markdownResponse(body: string, status: number, method: string, link?: string): Response {
  const headers = new Headers({
    'Content-Type': 'text/markdown; charset=utf-8',
    Vary: 'Accept',
  });
  if (link) headers.set('Link', link);
  return new Response(method === 'HEAD' ? null : body, { status, headers });
}

function notAcceptable(method: string, markdownPath: string): Response {
  return new Response(method === 'HEAD' ? null : 'Not Acceptable', {
    status: 406,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Vary: 'Accept',
      Link: discoveryLink(markdownPath),
    },
  });
}

function htmlResponse(markdownPath: string): NextResponse {
  const response = NextResponse.next();
  response.headers.set('Vary', 'Accept');
  response.headers.set('Link', discoveryLink(markdownPath));
  return response;
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

  const representation = negotiateRepresentation(request.headers.get('accept'));
  if (isAgentPagePath(pathname)) {
    const markdownPath = markdownPathFor(pathname);
    if (representation === 'markdown') {
      return markdownResponse(
        renderMarkdownPage(pathname, contentContext()),
        200,
        request.method,
        discoveryLink(markdownPath),
      );
    }
    if (representation === null) return notAcceptable(request.method, markdownPath);
    return htmlResponse(markdownPath);
  }

  if (representation === 'markdown') {
    return markdownResponse(buildMarkdownNotFound(), 404, request.method);
  }
  if (representation === null) return notAcceptable(request.method, '/index.md');
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
