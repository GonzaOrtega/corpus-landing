import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildMarkdownNotFound,
  notFoundDescription,
  notFoundRecoveryTargets,
  notFoundTitle,
} from '@/src/features/agent-readiness/content';
import NotFound, { metadata } from './not-found';

describe('NotFound page', () => {
  it('offers exactly the recovery targets the negotiated Markdown 404 offers, in order', () => {
    const html = renderToStaticMarkup(<NotFound />);
    const anchors = [...html.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(
      ([, href, label]) => ({
        path: href,
        label,
      }),
    );
    const markdown = buildMarkdownNotFound();

    expect(anchors).toEqual([...notFoundRecoveryTargets]);
    for (const target of notFoundRecoveryTargets) {
      expect(markdown).toContain(`[${target.label}](${target.path})`);
    }
  });

  it('renders the shared title and description as the page heading', () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain(`<h1>${notFoundTitle}</h1>`);
    expect(html).toContain(notFoundDescription);
    expect(html).toContain('aria-label="Recovery links"');
  });

  it('is never indexed but remains followable', () => {
    expect(metadata).toMatchObject({
      title: notFoundTitle,
      robots: { index: false, follow: true },
    });
  });
});
