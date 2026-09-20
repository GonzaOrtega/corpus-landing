import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/features/early-access/actions/join-early-access.action', () => ({
  joinEarlyAccessAction: async () => ({ status: 'idle' }),
}));

import Home from './page';

const env = {
  SITE_URL: 'https://corpus.example',
  CORPUS_RELEASE_STAGE: 'early-access',
  CORPUS_DOWNLOAD_URL: undefined,
  RECAPTCHA_SITE_KEY: undefined,
  VERCEL_ENV: undefined,
};

function stubEnv(overrides: Record<string, string | undefined> = {}): void {
  for (const [key, value] of Object.entries({ ...env, ...overrides })) vi.stubEnv(key, value);
}

describe('Home page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the early-access landing with the signup form and no download link', () => {
    stubEnv();

    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain('Join early access');
    expect(html).toContain('id="early-access-email"');
    expect(html).not.toContain('Get Corpus');
  });

  it('renders the launched landing with the validated download URL', () => {
    stubEnv({
      CORPUS_RELEASE_STAGE: 'launched',
      CORPUS_DOWNLOAD_URL: 'https://downloads.corpus.example/v1',
    });

    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain('Get Corpus');
    expect(html).toContain('href="https://downloads.corpus.example/v1"');
    expect(html).not.toContain('id="early-access-email"');
  });

  it('arms the real CAPTCHA only on the production deployment', () => {
    // The bridge loads the provider script client-side, so the server markup
    // shows the decision only through the hidden token: blank means "fetch a
    // real token", the fixed value means the deterministic fake.
    stubEnv({ RECAPTCHA_SITE_KEY: 'site-key-123', VERCEL_ENV: 'preview' });
    expect(renderToStaticMarkup(<Home />)).toContain('name="captchaToken" value="test-pass"');

    stubEnv({ RECAPTCHA_SITE_KEY: 'site-key-123', VERCEL_ENV: 'production' });
    expect(renderToStaticMarkup(<Home />)).toContain('name="captchaToken" value=""');
  });
});
