import type { Metadata, MetadataRoute } from 'next';
import type { ReleaseStage } from '@/src/config/release-stage';

interface DiscoveryOptions {
  siteUrl: URL;
  releaseStage: ReleaseStage;
}

const EARLY_ACCESS_DESCRIPTION = 'Learn words from real life. Join early access to Corpus.';
const LAUNCHED_DESCRIPTION = 'Learn words from real life with Corpus.';

export function buildSiteMetadata({ siteUrl, releaseStage }: DiscoveryOptions): Metadata {
  const launched = releaseStage === 'launched';
  const title = launched ? 'Corpus — Learn words from real life' : 'Corpus — Early access';
  const description = launched ? LAUNCHED_DESCRIPTION : EARLY_ACCESS_DESCRIPTION;

  return {
    metadataBase: siteUrl,
    title,
    description,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: '/',
      siteName: 'Corpus',
      title,
      description,
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'Corpus — Learn words from real life.',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/opengraph-image'],
    },
  };
}

export function buildPageRobotsMetadata(indexable: boolean): Metadata['robots'] {
  return { index: indexable, follow: indexable };
}

/** Only Vercel production is allowed into discovery; every other environment is private. */
export function isIndexableDeployment(vercelEnv: string | undefined): boolean {
  return vercelEnv === 'production';
}

export function buildRobotsMetadata(
  indexable: boolean,
  siteUrl = new URL('https://corpus.invalid'),
): MetadataRoute.Robots {
  if (!indexable) return { rules: { userAgent: '*', disallow: '/' } };

  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: new URL('/sitemap.xml', siteUrl).toString(),
  };
}

export function buildSitemapEntries(siteUrl: URL, indexable: boolean): MetadataRoute.Sitemap {
  if (!indexable) return [];

  return ['/', '/privacy', '/terms'].map((path) => ({ url: new URL(path, siteUrl).toString() }));
}
