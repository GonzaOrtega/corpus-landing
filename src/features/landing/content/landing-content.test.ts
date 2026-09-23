import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../early-access/actions/join-early-access.action', () => ({
  joinEarlyAccessAction: async () => ({ status: 'idle' }),
}));

import { LandingShell } from '../ui/landing-shell';
import { landingContent } from './landing-content';

describe('landing content', () => {
  it('names the three product stages in order', () => {
    expect(landingContent.stages.map(([name]) => name)).toEqual(['Capture', 'Enrich', 'Practice']);
    for (const [, summary, detail] of landingContent.stages) {
      expect(summary.trim()).not.toBe('');
      expect(detail.trim()).not.toBe('');
    }
  });

  it('only links navigation to anchors that exist in the rendered landing', () => {
    const html = renderToStaticMarkup(LandingShell({}));

    for (const item of landingContent.navigation) {
      expect(item.href).toMatch(/^#[a-z-]+$/);
      expect(html).toContain(`id="${item.href.slice(1)}"`);
      expect(html).toContain(`href="${item.href}"`);
    }
  });

  it('keeps the hero copy that the Markdown representation reuses', () => {
    expect(landingContent.hero.heading).toBe('Learn words from real life.');
    expect(landingContent.hero.note).toContain('early access begins on Android');
  });
});
