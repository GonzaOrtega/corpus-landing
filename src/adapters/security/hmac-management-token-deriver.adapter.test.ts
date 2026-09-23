import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HmacManagementTokenDeriver } from './hmac-management-token-deriver.adapter';

const SECRET = 'launch-management-secret-with-32-bytes!!';
const SIGNUP_ID = '4d2b6a7e-3f51-4c1e-9d3a-0b8a1c2d3e4f';

describe('HmacManagementTokenDeriver', () => {
  it('derives the same token for the same signup so a provider retry is body-identical', () => {
    const deriver = new HmacManagementTokenDeriver(SECRET);

    expect(deriver.deriveLaunchToken(SIGNUP_ID)).toBe(deriver.deriveLaunchToken(SIGNUP_ID));
  });

  it('derives different tokens for different signups and different secrets', () => {
    const deriver = new HmacManagementTokenDeriver(SECRET);
    const otherSecret = new HmacManagementTokenDeriver(`${SECRET}-rotated`);

    expect(deriver.deriveLaunchToken(SIGNUP_ID)).not.toBe(
      deriver.deriveLaunchToken('00000000-0000-4000-8000-000000000002'),
    );
    expect(deriver.deriveLaunchToken(SIGNUP_ID)).not.toBe(otherSecret.deriveLaunchToken(SIGNUP_ID));
  });

  it('emits URL-safe base64 with no padding, since the token travels in a URL fragment', () => {
    const token = new HmacManagementTokenDeriver(SECRET).deriveLaunchToken(SIGNUP_ID);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('=');
  });

  it('is an HMAC-SHA256 over the versioned context and signup id', () => {
    const expected = createHmac('sha256', SECRET)
      .update(`corpus-launch-management-v1:${SIGNUP_ID}`, 'utf8')
      .digest('base64url');

    expect(new HmacManagementTokenDeriver(SECRET).deriveLaunchToken(SIGNUP_ID)).toBe(expected);
  });

  it('refuses a secret shorter than 32 bytes', () => {
    expect(() => new HmacManagementTokenDeriver('a'.repeat(31))).toThrow(
      'MANAGEMENT_TOKEN_SECRET must contain at least 32 bytes',
    );
    expect(() => new HmacManagementTokenDeriver('a'.repeat(32))).not.toThrow();
  });

  it('measures the secret in bytes, not characters', () => {
    // Sixteen two-byte characters are 32 bytes; thirty-one ASCII characters are not.
    expect(() => new HmacManagementTokenDeriver('ñ'.repeat(16))).not.toThrow();
    expect(() => new HmacManagementTokenDeriver('x'.repeat(31))).toThrow();
  });
});
