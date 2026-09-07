import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../actions/join-early-access.action', () => ({
  joinEarlyAccessAction: async () => ({ status: 'idle' }),
}));

import { EarlyAccessSection } from './early-access-section';

describe('EarlyAccessSection', () => {
  it('renders the approved early-access copy and an accessible signup form', () => {
    const html = renderToStaticMarkup(
      <EarlyAccessSection recaptchaSiteKey={null} releaseStage="early-access" />,
    );

    expect(html).toContain('Early access');
    expect(html).toContain('Be there for the first build.');
    expect(html.replaceAll('&#x27;', "'")).toContain(
      "Corpus is still in private development. Leave your email and we'll let you know when there's a build worth trying.",
    );
    expect(html).toContain('Join the list');
    expect(html).toContain(
      'By joining, you agree to receive a confirmation email and one launch notification when Corpus is ready. No newsletter. Unsubscribe anytime.',
    );
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('for="early-access-email"');
    expect(html).toContain('name="captchaToken"');
    expect(html).toContain('value="test-pass"');
  });

  it('replaces signup with a validated download CTA once launched', () => {
    const html = renderToStaticMarkup(
      <EarlyAccessSection
        downloadUrl={new URL('https://download.example/corpus')}
        recaptchaSiteKey={null}
        releaseStage="launched"
      />,
    );

    expect(html).toContain('Get Corpus');
    expect(html).toContain('https://download.example/corpus');
    expect(html).not.toContain('Join the list');
    expect(html).not.toContain('No newsletter. Unsubscribe anytime.');
  });
});
