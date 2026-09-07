import { landingContent } from '../content/landing-content';
import { Hero } from './hero';
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
        <section className="section" id="how">
          <div className="wrap column">
            <p className="eyebrow">How it works</p>
            <h2>One word, three moments.</h2>
            <div className="stages">
              {landingContent.stages.map(([label, heading, body]) => (
                <article key={label}>
                  <p className="eyebrow">◆ {label}</p>
                  <h3>{heading}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="section lexicon" id="lexicon">
          <div className="wrap column">
            <p className="eyebrow">Your living lexicon</p>
            <h2>Your vocabulary isn't a list.</h2>
            <p className="lede">
              It's a record of what you noticed, where you found it, and what you eventually made
              your own. Move through it — every word keeps the moments it came from.
            </p>
            <p className="word-strip">lucent · petrichor · gloaming · brackish · askance</p>
          </div>
        </section>
        <section className="section philosophy">
          <div className="wrap column">
            <h2>Structure creates freedom.</h2>
            <p className="lede">
              Vocabulary starts with attention, not with a deck somebody else built.
            </p>
          </div>
        </section>
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
