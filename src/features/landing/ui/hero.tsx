import Link from 'next/link';
import { landingContent } from '../content/landing-content';
import { HeroMotion } from '../motion/hero-motion';

export function Hero() {
  return (
    <HeroMotion>
      <div className="wrap hero-grid">
        <div>
          <p className="eyebrow" data-hero="eyebrow">
            {landingContent.hero.eyebrow}
          </p>
          <h1 data-split>{landingContent.hero.heading}</h1>
          <p className="lede" data-hero="lede">
            {landingContent.hero.lede}
          </p>
          <div className="hero-actions" data-hero="cta">
            <Link className="button button-solid" data-magnetic href="#early-access">
              Join early access
            </Link>
            <Link className="button button-quiet" href="#how">
              See how it works
            </Link>
          </div>
          <p className="hero-note" data-hero="note">
            {landingContent.hero.note}
          </p>
        </div>
        <div className="hero-figure">
          <svg
            aria-hidden="true"
            className="hero-geo"
            fill="none"
            preserveAspectRatio="xMidYMid meet"
            viewBox="0 0 400 460"
          >
            <g data-depth="0.4">
              <path className="guide draw" d="M200 10 V450" />
              <path className="guide draw" d="M70 230 H330" />
            </g>
            <g data-depth="1">
              <path className="arc draw" d="M310 130 A130 130 0 1 0 310 330" />
              <path className="mark-diamond" d="M200 214 L216 230 L200 246 L184 230 Z" />
            </g>
          </svg>
          <div className="capture-demo">
            <div className="capture-field" data-hero="field">
              <span data-typed>lucent</span>
              <span aria-hidden="true" className="caret" data-caret />
              <span className="tag" data-hero="tag">
                saved
              </span>
            </div>
            <article className="specimen" data-hero="entry">
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
      </div>
    </HeroMotion>
  );
}
