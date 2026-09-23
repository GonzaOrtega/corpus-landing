import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { termsSections } from '@/src/features/legal/content';
import TermsPage, { metadata } from './page';

function stubEnv(overrides: Record<string, string | undefined> = {}): void {
  const env = {
    SITE_URL: 'https://corpus.example',
    REPLY_TO: undefined,
    EMAIL_POSTAL_ADDRESS: undefined,
  };
  for (const [key, value] of Object.entries({ ...env, ...overrides })) vi.stubEnv(key, value);
}

describe('Terms page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders every published section under the page title', () => {
    stubEnv();

    const html = renderToStaticMarkup(<TermsPage />);

    expect(html).toContain('<h1>Terms</h1>');
    for (const section of termsSections) expect(html).toContain(`<h2>${section.heading}</h2>`);
  });

  it('publishes contact details only when they are configured', () => {
    stubEnv({ REPLY_TO: 'hello@corpus.example', EMAIL_POSTAL_ADDRESS: '123 Example Street' });
    const configured = renderToStaticMarkup(<TermsPage />);
    expect(configured).toContain('<h2>Contact</h2>');
    expect(configured).toContain('hello@corpus.example');
    expect(configured).toContain('123 Example Street');

    stubEnv();
    expect(renderToStaticMarkup(<TermsPage />)).not.toContain('<h2>Contact</h2>');
  });

  it('advertises its canonical path and Markdown alternate', () => {
    expect(metadata.alternates).toEqual({
      canonical: '/terms',
      types: { 'text/markdown': '/terms.md' },
    });
  });
});
