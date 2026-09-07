import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '../../next.config';

describe('Content Security Policy', () => {
  it('upgrades insecure requests only in HTTPS production', () => {
    expect(buildContentSecurityPolicy(false)).toContain('upgrade-insecure-requests');
    expect(buildContentSecurityPolicy(true)).not.toContain('upgrade-insecure-requests');
  });
});
