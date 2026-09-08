import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../early-access/actions/join-early-access.action', () => ({
  joinEarlyAccessAction: async () => ({ status: 'idle' }),
}));

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
    expect(html).toContain('class="wrap"><div class="column hero-grid"');
    expect(html).toContain('Near: luminous, radiant, translucent');
    expect(html).not.toContain('<h2>lucent');
    expect(html).toContain('data-stuck="false"');
  });

  it('keeps every Capture, Enrich, and Practice demonstration readable in server HTML', () => {
    const html = renderToStaticMarkup(<LandingShell />);

    expect(html).toContain('Saved. Nothing else needed.');
    expect(html).toContain('Near: luminous, radiant, translucent');
    expect(html).toContain('The water was');
    expect(html).toContain('in the late afternoon.');
  });

  it('changes only early-access surfaces when the product is launched', () => {
    const html = renderToStaticMarkup(
      <LandingShell
        downloadUrl={new URL('https://download.example/corpus')}
        recaptchaSiteKey={null}
        releaseStage="launched"
      />,
    );

    expect(html).toContain('Get Corpus');
    expect(html).toContain('Early access is open on Android.');
    expect(html).not.toContain('Join the list');
    expect(html).not.toContain('No newsletter. Unsubscribe anytime.');
  });
});
