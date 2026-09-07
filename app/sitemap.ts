import type { MetadataRoute } from 'next';
import { loadServerConfig } from '@/src/config/server-env';
import { buildSitemapEntries, isIndexableDeployment } from '@/src/features/legal/discovery';

export default function sitemap(): MetadataRoute.Sitemap {
  const config = loadServerConfig(process.env);
  return buildSitemapEntries(config.siteUrl, isIndexableDeployment(process.env.VERCEL_ENV));
}
