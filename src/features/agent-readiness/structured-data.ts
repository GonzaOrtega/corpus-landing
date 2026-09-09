import type { SiteConfig } from '@/src/config/server-env';

interface JsonLdThing {
  '@type': string;
  [key: string]: unknown;
}

interface CorpusJsonLd {
  '@context': 'https://schema.org';
  '@graph': JsonLdThing[];
}

export function buildCorpusStructuredData(config: SiteConfig): CorpusJsonLd {
  const siteUrl = config.siteUrl.toString();
  const organizationId = new URL('/#organization', config.siteUrl).toString();
  const applicationId = new URL('/#software-application', config.siteUrl).toString();
  const contactUrl = new URL('/contact', config.siteUrl).toString();

  const contactPoint: JsonLdThing = {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: contactUrl,
    ...(config.replyTo ? { email: config.replyTo } : {}),
  };
  const address: JsonLdThing = config.emailPostalAddress
    ? {
        '@type': 'PostalAddress',
        streetAddress: config.emailPostalAddress,
      }
    : {
        '@type': 'PostalAddress',
        name: 'See the Corpus contact page for published postal details.',
        url: contactUrl,
      };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: 'Corpus',
        url: siteUrl,
        description: 'The organization responsible for the Corpus vocabulary-learning product.',
        contactPoint,
        address,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': applicationId,
        name: 'Corpus',
        url: siteUrl,
        description:
          'Corpus helps learners capture words from real life, enrich a personal lexicon, and practise vocabulary from their own encounters.',
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Android',
        publisher: { '@id': organizationId },
      },
    ],
  };
}

export function serializeStructuredData(data: CorpusJsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
