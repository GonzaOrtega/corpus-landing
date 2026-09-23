import { describe, expect, it } from 'vitest';
import { renderMarkdownPage } from '../agent-readiness/content';
import { privacySections, termsSections } from './content';

describe.each([
  ['privacy', privacySections, '/privacy' as const],
  ['terms', termsSections, '/terms' as const],
])('%s sections', (_label, sections, path) => {
  it('are non-empty with unique headings and non-empty paragraphs', () => {
    expect(sections.length).toBeGreaterThan(0);
    expect(new Set(sections.map((section) => section.heading)).size).toBe(sections.length);
    for (const section of sections) {
      expect(section.heading.trim()).not.toBe('');
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) expect(paragraph.trim()).not.toBe('');
    }
  });

  it('appear verbatim in the Markdown representation so both surfaces say the same thing', () => {
    const markdown = renderMarkdownPage(path, { releaseStage: 'early-access' });

    for (const section of sections) {
      expect(markdown).toContain(`## ${section.heading}`);
      for (const paragraph of section.paragraphs) expect(markdown).toContain(paragraph);
    }
  });
});
