import { describe, expect, it } from 'vitest';
import { signupSchema } from './signup.schema';

describe('signupSchema', () => {
  it('trims the original email and derives a lowercase normalized value', () => {
    expect(
      signupSchema.parse({ email: '  Person@Example.COM  ', captchaToken: 'test-pass' }),
    ).toEqual({
      emailOriginal: 'Person@Example.COM',
      emailNormalized: 'person@example.com',
      captchaToken: 'test-pass',
    });
  });

  it('rejects invalid email syntax', () => {
    expect(
      signupSchema.safeParse({ email: 'not-an-email', captchaToken: 'test-pass' }).success,
    ).toBe(false);
  });

  it('accepts an address at the 254-character SMTP limit', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(185)}.com`;
    const email = `${local}@${domain}`;
    expect(email).toHaveLength(254);
    expect(signupSchema.safeParse({ email, captchaToken: 'test-pass' }).success).toBe(true);
  });

  it('rejects an over-long address on length, before the email regex runs', () => {
    // This parse happens ahead of the release-stage and CAPTCHA gates, so an
    // anonymous caller can reach it: an unbounded string would burn regex CPU
    // per request and could land unbounded in a text column.
    const email = `${'a'.repeat(64)}@${'b'.repeat(100_000)}.com`;
    const result = signupSchema.safeParse({ email, captchaToken: 'test-pass' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.code === 'too_big')).toBe(true);
  });
});
