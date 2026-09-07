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

/**
 * Spec §22. No request nonces in v1 — that would force dynamic rendering of
 * the static-first landing. Dev only relaxes what Next.js tooling actually
 * needs: Fast Refresh needs `unsafe-eval`, and the HMR client needs a
 * websocket back to the dev server.
 */
function buildContentSecurityPolicy(isDev: boolean): string {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...RECAPTCHA_SCRIPT_ORIGINS];
  const connectSrc = ["'self'", ...RECAPTCHA_CONNECT_ORIGINS];
  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push('ws:', 'wss:');
  }

  return [
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
    'upgrade-insecure-requests',
  ].join('; ');
}

const nextConfig: NextConfig = {
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(isDev) },
        ],
      },
    ];
  },
};

export default nextConfig;
