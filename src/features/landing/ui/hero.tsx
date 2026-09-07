import Link from 'next/link';
import { landingContent } from '../content/landing-content';

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="wrap hero-grid">
        <div>
          <p className="eyebrow">{landingContent.hero.eyebrow}</p>
          <h1>{landingContent.hero.heading}</h1>
          <p className="lede">{landingContent.hero.lede}</p>
          <div className="hero-actions">
            <Link className="button button-solid" href="#early-access">
              Join early access
            </Link>
            <Link className="button button-quiet" href="#how">
              See how it works
            </Link>
          </div>
          <p className="hero-note">{landingContent.hero.note}</p>
        </div>
        <div className="capture-demo">
          <div className="capture-field">
            <span>lucent</span>
            <span aria-hidden="true" className="caret" />
            <span className="tag">saved</span>
          </div>
          <article className="specimen">
            <h2>
              lucent <em>adjective</em>
            </h2>
            <p className="ipa">/ˈluːs(ə)nt/</p>
            <p>Softly bright; glowing with, or reflecting, light.</p>
            <p className="muted">
              Heard in <strong>a podcast</strong>, 12 August
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
