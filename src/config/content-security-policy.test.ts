import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '../../next.config';

describe('Content Security Policy', () => {
  it('upgrades insecure requests only in HTTPS production', () => {
    expect(buildContentSecurityPolicy(false)).toContain('upgrade-insecure-requests');
    expect(buildContentSecurityPolicy(true)).not.toContain('upgrade-insecure-requests');
  });

  // A production build served over http://localhost is what the E2E suite
  // runs. Upgrading subresources there points them at a TLS port nothing is
  // listening on: WebKit honours it on localhost and loads the page with no
  // CSS, Chromium silently exempts localhost and hides the problem.
  it('does not upgrade requests for a production build served over plain HTTP', () => {
    expect(buildContentSecurityPolicy(false, false)).not.toContain('upgrade-insecure-requests');
  });

  it('keeps every other directive when the origin is not HTTPS', () => {
    const insecure = buildContentSecurityPolicy(false, false);
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ]) {
      expect(insecure).toContain(directive);
    }
    expect(insecure).not.toContain("'unsafe-eval'");
  });
});
