import { describe, expect, it } from 'vitest';
import { GoogleRecaptchaAdapter, type RecaptchaFetch } from './google-recaptcha.adapter';

const acceptedResponse = {
  success: true,
  score: 0.9,
  action: 'early_access_signup',
  hostname: 'corpus.example',
  challenge_ts: '2026-09-07T12:00:00Z',
  'error-codes': [],
};

function buildAdapter(response: unknown) {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const fetcher: RecaptchaFetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(response), { status: 200 });
  };
  return {
    adapter: new GoogleRecaptchaAdapter('secret', 0.5, 'corpus.example', fetcher),
    calls,
  };
}

describe('GoogleRecaptchaAdapter', () => {
  it('accepts a valid response for the expected action, score, and hostname', async () => {
    const { adapter, calls } = buildAdapter(acceptedResponse);

    await expect(
      adapter.verify({ token: 'opaque-captcha-token', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: true });
    const request = calls[0]?.init;
    expect(request?.body?.toString()).toContain('secret=secret');
    expect(request?.body?.toString()).toContain('response=opaque-captcha-token');
    expect(request?.body?.toString()).not.toContain('remoteip');
  });

  it.each([
    ['provider rejection', { ...acceptedResponse, success: false }],
    ['wrong action', { ...acceptedResponse, action: 'other_action' }],
    ['low score', { ...acceptedResponse, score: 0.49 }],
    ['wrong hostname', { ...acceptedResponse, hostname: 'attacker.example' }],
    ['malformed response', { success: true }],
  ])('fails closed for %s', async (_name, response) => {
    const { adapter } = buildAdapter(response);

    await expect(
      adapter.verify({ token: 'opaque-captcha-token', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: false });
  });

  it('fails closed when the provider request fails', async () => {
    const adapter = new GoogleRecaptchaAdapter('secret', 0.5, 'corpus.example', async () => {
      throw new Error('network failure');
    });

    await expect(
      adapter.verify({ token: 'opaque-captcha-token', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: false });
  });
});
