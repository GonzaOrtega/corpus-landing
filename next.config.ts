import type { NextConfig } from 'next';

/**
 * Verified against Google's reCAPTCHA CSP guidance
 * (developers.google.com/recaptcha/docs/faq) at write time — do not widen
 * these without re-checking; spec §22 forbids wildcard third-party origins.
 */
const RECAPTCHA_SCRIPT_ORIGINS = [
  'https://www.google.com/recaptcha/',
  'https://www.gstatic.com/recaptcha/',
];
const RECAPTCHA_FRAME_ORIGINS = [
  'https://www.google.com/recaptcha/',
  'https://recaptcha.google.com/recaptcha/',
];
const RECAPTCHA_CONNECT_ORIGINS = ['https://www.google.com/recaptcha/'];

/** Next's App Router varies HTML/RSC responses by these headers. Include
 * Accept as well because Corpus adds an HTTP-negotiated Markdown variant.
 * Proxy cannot reliably extend Vary in Next 16 (vercel/next.js#85852), so
 * this is applied through Next's static response-header configuration. */
const AGENT_CONTENT_VARY =
  'Accept, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch';
const AGENT_CONTENT_PATHS = [
  '/',
  '/about',
  '/contact',
  '/developers',
  '/privacy',
  '/terms',
] as const;

/**
 * Spec §22. No request nonces in v1 — that would force dynamic rendering of
 * the static-first landing. Dev only relaxes what Next.js tooling actually
 * needs: Fast Refresh needs `unsafe-eval`, and the HMR client needs a
 * websocket back to the dev server.
 */
export function buildContentSecurityPolicy(isDev: boolean, servedOverHttps = !isDev): string {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...RECAPTCHA_SCRIPT_ORIGINS];
  const connectSrc = ["'self'", ...RECAPTCHA_CONNECT_ORIGINS];
  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push('ws:', 'wss:');
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc.join(' ')}`,
    `frame-src ${RECAPTCHA_FRAME_ORIGINS.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
  ];
  // Only meaningful on an HTTPS origin. A production build served over
  // http://localhost — which the E2E suite does — would otherwise tell the
  // browser to upgrade every subresource to https. Chromium exempts localhost
  // as a trustworthy origin; WebKit does not, so every stylesheet and script
  // fails its TLS handshake and the page renders with no CSS at all.
  if (servedOverHttps) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    // @typescript/typescript6 delegates its CLI through a compatibility wrapper
    // whose stdout is not capturable by Next 16.3's CLI type-check runner.
    // The package still exposes the full TS 6 compiler API, which avoids that
    // wrapper and is the same compiler used by the repository typecheck.
    useTypeScriptCli: false,
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    // Every Vercel deployment is HTTPS and sets VERCEL_ENV; a local `next
    // start` is plain HTTP and does not. Deployed behaviour is unchanged.
    const servedOverHttps = Boolean(process.env.VERCEL_ENV);
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: buildContentSecurityPolicy(isDev, servedOverHttps),
          },
        ],
      },
      ...AGENT_CONTENT_PATHS.map((source) => ({
        source,
        headers: [{ key: 'Vary', value: AGENT_CONTENT_VARY }],
      })),
    ];
  },
};

export default nextConfig;
