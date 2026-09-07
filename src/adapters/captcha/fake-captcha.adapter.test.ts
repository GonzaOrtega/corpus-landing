import { describe, expect, it } from 'vitest';
import { FakeCaptchaAdapter } from './fake-captcha.adapter';

describe('FakeCaptchaAdapter', () => {
  it('accepts only the deterministic test-pass token without network access', async () => {
    const adapter = new FakeCaptchaAdapter();

    await expect(
      adapter.verify({ token: 'test-pass', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: true });
    await expect(
      adapter.verify({ token: 'test-fail', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: false });
  });
});
