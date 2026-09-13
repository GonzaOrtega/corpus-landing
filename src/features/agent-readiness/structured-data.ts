import type { SiteConfig } from '@/src/config/server-env';

interface JsonLdThing {
  '@type': string;
  [key: string]: unknown;
}

interface CorpusJsonLd {
  '@context': 'https://schema.org';
  '@graph': JsonLdThing[];
}

/**
 * Public profiles for `Organization.sameAs`. Entity reconciliation — an agent or
 * search engine tying this domain to the "Corpus" brand — is the point of this
 * field, so only add URLs Corpus actually controls and keeps live.
 */
const ORGANIZATION_PROFILES: readonly string[] = [];

export function buildCorpusStructuredData(config: SiteConfig): CorpusJsonLd {
  const siteUrl = config.siteUrl.toString();
  const organizationId = new URL('/#organization', config.siteUrl).toString();
  const applicationId = new URL('/#software-application', config.siteUrl).toString();
  const websiteId = new URL('/#website', config.siteUrl).toString();
  const contactUrl = new URL('/contact', config.siteUrl).toString();
  const launched = config.releaseStage === 'launched';

  const contactPoint: JsonLdThing = {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: contactUrl,
    ...(config.replyTo ? { email: config.replyTo } : {}),
  };

  // Corpus is free to join in early access and free at launch. Google and Ora
  // both expect `offers` on SoftwareApplication; availability tracks the real
  // release stage rather than asserting a shipped product.
  const offers: JsonLdThing = {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: launched ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
    url: siteUrl,
  };

  const organization: JsonLdThing = {
    '@type': 'Organization',
    '@id': organizationId,
    name: 'Corpus',
    url: siteUrl,
    logo: new URL('/brand/corpus-mark.svg', config.siteUrl).toString(),
    description: 'The organization responsible for the Corpus vocabulary-learning product.',
    contactPoint,
    // A postal address is only asserted when one is actually published. Emitting
    // a placeholder PostalAddress would hand agents a fabricated fact.
    ...(config.emailPostalAddress
      ? { address: { '@type': 'PostalAddress', streetAddress: config.emailPostalAddress } }
      : {}),
    ...(ORGANIZATION_PROFILES.length > 0 ? { sameAs: [...ORGANIZATION_PROFILES] } : {}),
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: 'Corpus',
        url: siteUrl,
        inLanguage: 'en',
        publisher: { '@id': organizationId },
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
        inLanguage: 'en',
        offers,
        ...(config.downloadUrl ? { downloadUrl: config.downloadUrl.toString() } : {}),
        publisher: { '@id': organizationId },
      },
    ],
  };
}

export function serializeStructuredData(data: CorpusJsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
