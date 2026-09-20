import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { developerSections } from '@/src/features/agent-readiness/content';
import DevelopersPage, { metadata } from './page';

describe('Developers page', () => {
  it('renders every published section under the page title', () => {
    const html = renderToStaticMarkup(<DevelopersPage />);

    expect(html).toContain('<h1>Corpus Developer Resources</h1>');
    for (const section of developerSections) expect(html).toContain(`<h2>${section.heading}</h2>`);
  });

  it('advertises its canonical path and Markdown alternate', () => {
    expect(metadata.alternates).toEqual({
      canonical: '/developers',
      types: { 'text/markdown': '/developers.md' },
    });
  });
});
