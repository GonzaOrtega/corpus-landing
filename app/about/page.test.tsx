import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { aboutSections } from '@/src/features/agent-readiness/content';
import AboutPage, { metadata } from './page';

describe('About page', () => {
  it('renders every published section under the page title', () => {
    const html = renderToStaticMarkup(<AboutPage />);

    expect(html).toContain('<h1>About Corpus</h1>');
    for (const section of aboutSections) expect(html).toContain(`<h2>${section.heading}</h2>`);
  });

  it('advertises its canonical path and Markdown alternate', () => {
    expect(metadata.alternates).toEqual({
      canonical: '/about',
      types: { 'text/markdown': '/about.md' },
    });
  });
});
