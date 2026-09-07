import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LegalPage, privacySections, termsSections } from './legal-page';

describe('LegalPage content', () => {
  it('describes only the implemented early-access collection and processors', () => {
    const html = renderToStaticMarkup(
      <LegalPage
        description="How Corpus handles early-access information."
        sections={privacySections}
        title="Privacy"
      />,
    );

    expect(html).toContain(
      'email address, consent record, and early-access lifecycle and delivery status',
    );
    expect(html).toContain('Neon');
    expect(html).toContain('Resend');
    expect(html).toContain('Google reCAPTCHA');
    expect(html).toContain('Vercel Web Analytics and Speed Insights');
    expect(html).toContain('30 days');
    expect(html).toContain('do not sell your information');
    expect(html).toContain('do not use email open or click tracking');
  });

  it('keeps terms specific to the pre-release product and distribution limits', () => {
    const html = renderToStaticMarkup(
      <LegalPage description="Terms for using Corpus." sections={termsSections} title="Terms" />,
    );

    expect(html).toContain('pre-release product');
    expect(html).toContain('do not guarantee a release date');
    expect(html).toContain('features and availability may change');
    expect(html).toContain('defects');
    expect(html).toContain('platform and distribution requirements');
    expect(html).toContain('must not abuse');
  });
});
