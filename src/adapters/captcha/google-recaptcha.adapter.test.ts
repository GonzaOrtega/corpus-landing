import { describe, expect, it } from 'vitest';
import { GoogleRecaptchaAdapter, type RecaptchaFetch } from './google-recaptcha.adapter';

const acceptedResponse = {
  tokenProperties: {
    valid: true,
    hostname: 'corpus.example',
    action: 'early_access_signup',
    createTime: '2026-09-09T12:00:00Z',
  },
  riskAnalysis: {
    score: 0.9,
    reasons: [],
  },
  name: 'projects/corpus-project/assessments/assessment-1',
};

function buildAdapter(response: unknown, status = 200) {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const fetcher: RecaptchaFetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(response), { status });
  };
  return {
    adapter: new GoogleRecaptchaAdapter(
      'api-key',
      'corpus-project',
      'site-key',
      0.5,
      'corpus.example',
      fetcher,
    ),
    calls,
  };
}

describe('GoogleRecaptchaAdapter', () => {
  it('creates an assessment and accepts a valid token for the expected action, score, and hostname', async () => {
    const { adapter, calls } = buildAdapter(acceptedResponse);

    await expect(
      adapter.verify({ token: 'opaque-captcha-token', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: true });

    const call = calls[0];
    expect(String(call?.input)).toBe(
      'https://recaptchaenterprise.googleapis.com/v1/projects/corpus-project/assessments?key=api-key',
    );
    expect(call?.init?.method).toBe('POST');
    expect(new Headers(call?.init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      event: {
        token: 'opaque-captcha-token',
        siteKey: 'site-key',
        expectedAction: 'early_access_signup',
      },
    });
  });

  it.each([
    [
      'invalid token',
      {
        ...acceptedResponse,
        tokenProperties: { ...acceptedResponse.tokenProperties, valid: false },
      },
    ],
    [
      'wrong action',
      {
        ...acceptedResponse,
        tokenProperties: { ...acceptedResponse.tokenProperties, action: 'other_action' },
      },
    ],
    [
      'low score',
      { ...acceptedResponse, riskAnalysis: { ...acceptedResponse.riskAnalysis, score: 0.49 } },
    ],
    [
      'wrong hostname',
      {
        ...acceptedResponse,
        tokenProperties: { ...acceptedResponse.tokenProperties, hostname: 'attacker.example' },
      },
    ],
    ['malformed response', { tokenProperties: { valid: true } }],
  ])('fails closed for %s', async (_name, response) => {
    const { adapter } = buildAdapter(response);

    await expect(
      adapter.verify({ token: 'opaque-captcha-token', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: false });
  });

  it('fails closed when the assessment endpoint rejects the request', async () => {
    const { adapter } = buildAdapter({ error: { message: 'rejected' } }, 403);

    await expect(
      adapter.verify({ token: 'opaque-captcha-token', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: false });
  });

  it('fails closed when the provider request fails', async () => {
    const adapter = new GoogleRecaptchaAdapter(
      'api-key',
      'corpus-project',
      'site-key',
      0.5,
      'corpus.example',
      async () => {
        throw new Error('network failure');
      },
    );

    await expect(
      adapter.verify({ token: 'opaque-captcha-token', action: 'early_access_signup' }),
    ).resolves.toEqual({ accepted: false });
  });
});
