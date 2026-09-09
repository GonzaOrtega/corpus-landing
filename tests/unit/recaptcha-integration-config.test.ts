import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('reCAPTCHA client integration', () => {
  it('loads the Enterprise score script instead of the legacy api.js client', async () => {
    const source = await readFile(
      new URL('../../src/features/early-access/ui/recaptcha-bridge.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('https://www.google.com/recaptcha/enterprise.js?render=');
    expect(source).toContain('captcha.enterprise');
    expect(source).not.toContain('https://www.google.com/recaptcha/api.js?render=');
  });
});
