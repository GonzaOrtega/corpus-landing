import type { MetadataRoute } from 'next';
import { loadSiteConfig } from '@/src/config/server-env';
import { buildRobotsMetadata, isIndexableDeployment } from '@/src/features/legal/discovery';

export default function robots(): MetadataRoute.Robots {
  const config = loadSiteConfig(process.env);
  return buildRobotsMetadata(isIndexableDeployment(process.env.VERCEL_ENV), config.siteUrl);
}
