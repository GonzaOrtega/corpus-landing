import { describe, expect, it } from 'vitest';
import type { SiteConfig } from '@/src/config/server-env';
import { buildCorpusStructuredData, serializeStructuredData } from './structured-data';

const baseConfig: SiteConfig = {
  siteUrl: new URL('https://corpus.example/'),
  releaseStage: 'early-access',
  downloadUrl: null,
  replyTo: 'hello@corpus.example',
  emailPostalAddress: null,
};

function entity(config: SiteConfig, type: string) {
  return buildCorpusStructuredData(config)['@graph'].find((node) => node['@type'] === type);
}

describe('Corpus structured data', () => {
  it('publishes the identity types agents look for', () => {
    const types = buildCorpusStructuredData(baseConfig)['@graph'].map((node) => node['@type']);
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication']);
  });

  it('describes the application with the fields required for machine parsing', () => {
    expect(entity(baseConfig, 'SoftwareApplication')).toMatchObject({
      name: 'Corpus',
      url: 'https://corpus.example/',
      applicationCategory: 'EducationalApplication',
      offers: { '@type': 'Offer', price: '0', availability: 'https://schema.org/PreOrder' },
    });
  });

  it('marks the application in stock once Corpus has launched', () => {
    const launched = entity({ ...baseConfig, releaseStage: 'launched' }, 'SoftwareApplication');
    expect(launched).toMatchObject({ offers: { availability: 'https://schema.org/InStock' } });
  });

  it('advertises a download URL only once one is configured', () => {
    expect(entity(baseConfig, 'SoftwareApplication')).not.toHaveProperty('downloadUrl');
    const withDownload = entity(
      { ...baseConfig, downloadUrl: new URL('https://downloads.corpus.example/android') },
      'SoftwareApplication',
    );
    expect(withDownload).toHaveProperty('downloadUrl', 'https://downloads.corpus.example/android');
  });

  it('omits the postal address rather than asserting a placeholder one', () => {
    expect(entity(baseConfig, 'Organization')).not.toHaveProperty('address');
    expect(
      entity({ ...baseConfig, emailPostalAddress: 'Calle 1, Buenos Aires' }, 'Organization'),
    ).toMatchObject({
      address: { '@type': 'PostalAddress', streetAddress: 'Calle 1, Buenos Aires' },
    });
  });

  it('drops the contact email from the graph when none is published', () => {
    expect(entity({ ...baseConfig, replyTo: null }, 'Organization')).toMatchObject({
      contactPoint: { url: 'https://corpus.example/contact' },
    });
    expect(entity(baseConfig, 'Organization')).toMatchObject({
      contactPoint: { email: 'hello@corpus.example' },
    });
  });

  it('escapes less-than characters so the JSON cannot close its own script tag', () => {
    const serialized = serializeStructuredData(
      buildCorpusStructuredData({
        ...baseConfig,
        emailPostalAddress: '</script><script>alert(1)</script>',
      }),
    );
    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script');
    expect(JSON.parse(serialized)).toBeTruthy();
  });
});
