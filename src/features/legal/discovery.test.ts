import { describe, expect, it } from 'vitest';
import {
  buildPageRobotsMetadata,
  buildRobotsMetadata,
  buildSiteMetadata,
  buildSitemapEntries,
  isIndexableDeployment,
} from './discovery';

const siteUrl = new URL('https://corpus.example');

describe('discovery surfaces', () => {
  it('uses the configured canonical origin and early-access wording', () => {
    const metadata = buildSiteMetadata({ siteUrl, releaseStage: 'early-access' });

    expect(metadata.metadataBase).toEqual(siteUrl);
    expect(metadata.alternates?.canonical).toBe('/');
    expect(metadata.title).toBe('Corpus — Early access');
    expect(metadata.description).toBe('Learn words from real life. Join early access to Corpus.');
    expect(metadata.openGraph?.url).toBe('/');
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('changes only product wording once Corpus has launched', () => {
    const metadata = buildSiteMetadata({ siteUrl, releaseStage: 'launched' });

    expect(metadata.title).toBe('Corpus — Learn words from real life');
    expect(metadata.description).toBe('Learn words from real life with Corpus.');
  });

  it('only allows production deployments to be indexed', () => {
    expect(isIndexableDeployment('production')).toBe(true);
    expect(isIndexableDeployment('preview')).toBe(false);
    expect(isIndexableDeployment(undefined)).toBe(false);

    expect(buildRobotsMetadata(true, siteUrl)).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://corpus.example/sitemap.xml',
    });
    expect(buildRobotsMetadata(false)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(buildPageRobotsMetadata(false)).toEqual({ index: false, follow: false });
    expect(buildPageRobotsMetadata(true)).toEqual({ index: true, follow: true });
  });

  it('publishes only canonical public pages in the production sitemap', () => {
    expect(buildSitemapEntries(siteUrl, true).map((entry) => entry.url)).toEqual([
      'https://corpus.example/',
      'https://corpus.example/privacy',
      'https://corpus.example/terms',
    ]);
    expect(buildSitemapEntries(siteUrl, false)).toEqual([]);
  });
});
