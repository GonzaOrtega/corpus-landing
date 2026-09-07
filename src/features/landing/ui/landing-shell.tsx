import type { ReleaseStage } from '../../../config/release-stage';
import { EarlyAccessSection } from '../../early-access/ui/early-access-section';
import { CaptureEnrichPractice } from './capture-enrich-practice';
import { Hero } from './hero';
import { LivingLexicon } from './living-lexicon';
import { PhilosophySection } from './philosophy-section';
import { ProgressSpine } from './progress-spine';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

interface LandingShellProps {
  releaseStage?: ReleaseStage;
  downloadUrl?: URL | null;
  recaptchaSiteKey?: string | null;
}

export function LandingShell({
  releaseStage = 'early-access',
  downloadUrl = null,
  recaptchaSiteKey = null,
}: LandingShellProps) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ProgressSpine />
      <SiteHeader downloadUrl={downloadUrl} releaseStage={releaseStage} />
      <main id="main">
        <Hero downloadUrl={downloadUrl} releaseStage={releaseStage} />
        <CaptureEnrichPractice />
        <LivingLexicon />
        <PhilosophySection />
        <EarlyAccessSection
          downloadUrl={downloadUrl}
          recaptchaSiteKey={recaptchaSiteKey}
          releaseStage={releaseStage}
        />
      </main>
      <SiteFooter />
    </>
  );
}
