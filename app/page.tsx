import { loadPublicConfig, productionRecaptchaSiteKey } from '../src/config/public-env';
import { loadServerConfig } from '../src/config/server-env';
import { LandingShell } from '../src/features/landing/ui/landing-shell';

export default function Home() {
  const serverConfig = loadServerConfig(process.env);
  const publicConfig = loadPublicConfig({ RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY });
  const recaptchaSiteKey = productionRecaptchaSiteKey(process.env.VERCEL_ENV, publicConfig);

  return (
    <LandingShell
      downloadUrl={serverConfig.downloadUrl}
      recaptchaSiteKey={recaptchaSiteKey}
      releaseStage={serverConfig.releaseStage}
    />
  );
}
