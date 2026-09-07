import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LandingShell } from './landing-shell';

describe('LandingShell', () => {
  it('renders the approved semantic landmarks, skip link, and early-access navigation', () => {
    const html = renderToStaticMarkup(<LandingShell />);

    expect(html).toContain('href="#main"');
    expect(html).toContain('<header');
    expect(html).toContain('<main id="main"');
    expect(html).toContain('<footer');
    expect(html).toContain('Learn words from real life.');
    expect(html).toContain('Join early access');
  });
});
