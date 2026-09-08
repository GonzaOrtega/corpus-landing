import type { MetadataRoute } from 'next';
import { loadSiteConfig } from '@/src/config/server-env';
import { buildSitemapEntries, isIndexableDeployment } from '@/src/features/legal/discovery';

export default function sitemap(): MetadataRoute.Sitemap {
  const config = loadSiteConfig(process.env);
  return buildSitemapEntries(config.siteUrl, isIndexableDeployment(process.env.VERCEL_ENV));
}
