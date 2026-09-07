import { describe, expect, it, vi } from 'vitest';
import { CaptchaRejectedError, SignupClosedError } from '../../../core/errors/early-access-errors';
import { LocalEarlyAccessBackend } from './local-early-access-backend';

const input = {
  emailOriginal: 'Person@Example.com',
  emailNormalized: 'person@example.com',
  captchaToken: 'test-pass',
};

describe('LocalEarlyAccessBackend', () => {
  it('verifies CAPTCHA before joining and requests confirmation for a fresh credential', async () => {
    const order: string[] = [];
    const backend = new LocalEarlyAccessBackend(
      'early-access',
      {
        verify: vi.fn(async () => {
          order.push('captcha');
          return { accepted: true };
        }),
      },
      {
        execute: vi.fn(async () => {
          order.push('join');
          return {
            signupId: 'signup-1',
            shouldSendConfirmation: true,
            managementToken: 'raw-token',
          };
        }),
      },
      vi.fn(async () => {
        order.push('confirmation');
      }),
    );

    await backend.join(input);

    expect(order).toEqual(['captcha', 'join', 'confirmation']);
  });

  it('does not request confirmation for an active duplicate', async () => {
    const requestConfirmation = vi.fn(async () => undefined);
    const backend = new LocalEarlyAccessBackend(
      'early-access',
      { verify: vi.fn(async () => ({ accepted: true })) },
      {
        execute: vi.fn(async () => ({
          signupId: 'signup-1',
          shouldSendConfirmation: false,
          managementToken: null,
        })),
      },
      requestConfirmation,
    );

    await backend.join(input);

    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it('rejects launched mode before CAPTCHA or persistence', async () => {
    const captcha = { verify: vi.fn(async () => ({ accepted: true })) };
    const join = { execute: vi.fn() };
    const backend = new LocalEarlyAccessBackend('launched', captcha, join, vi.fn());

    await expect(backend.join(input)).rejects.toBeInstanceOf(SignupClosedError);
    expect(captcha.verify).not.toHaveBeenCalled();
    expect(join.execute).not.toHaveBeenCalled();
  });

  it('rejects CAPTCHA failure before persistence', async () => {
    const join = { execute: vi.fn() };
    const backend = new LocalEarlyAccessBackend(
      'early-access',
      { verify: vi.fn(async () => ({ accepted: false })) },
      join,
      vi.fn(),
    );

    await expect(backend.join(input)).rejects.toBeInstanceOf(CaptchaRejectedError);
    expect(join.execute).not.toHaveBeenCalled();
  });
});
