import { loadPublicConfig, productionRecaptchaSiteKey } from '../src/config/public-env';
import { loadSiteConfig } from '../src/config/server-env';
import { LandingShell } from '../src/features/landing/ui/landing-shell';

export default function Home() {
  const siteConfig = loadSiteConfig(process.env);
  const publicConfig = loadPublicConfig({ RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY });
  const recaptchaSiteKey = productionRecaptchaSiteKey(process.env.VERCEL_ENV, publicConfig);

  return (
    <LandingShell
      downloadUrl={siteConfig.downloadUrl}
      recaptchaSiteKey={recaptchaSiteKey}
      releaseStage={siteConfig.releaseStage}
    />
  );
}
