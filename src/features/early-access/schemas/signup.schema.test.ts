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
});
