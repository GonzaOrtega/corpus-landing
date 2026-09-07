import { CaptureEnrichPractice } from './capture-enrich-practice';
import { Hero } from './hero';
import { LivingLexicon } from './living-lexicon';
import { PhilosophySection } from './philosophy-section';
import { ProgressSpine } from './progress-spine';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function LandingShell() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ProgressSpine />
      <SiteHeader />
      <main id="main">
        <Hero />
        <CaptureEnrichPractice />
        <LivingLexicon />
        <PhilosophySection />
        <section className="section early-access" id="early-access">
          <div className="wrap column">
            <p className="eyebrow">Early access</p>
            <h2>Be there for the first build.</h2>
            <p className="lede">
              Corpus is still in private development. Leave your email and we'll write once, when
              there's a build worth trying.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
