import type { MetadataRoute } from 'next';
import { loadServerConfig } from '@/src/config/server-env';
import { buildRobotsMetadata, isIndexableDeployment } from '@/src/features/legal/discovery';

export default function robots(): MetadataRoute.Robots {
  const config = loadServerConfig(process.env);
  return buildRobotsMetadata(isIndexableDeployment(process.env.VERCEL_ENV), config.siteUrl);
}
