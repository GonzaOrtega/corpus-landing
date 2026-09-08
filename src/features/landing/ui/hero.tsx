import Link from 'next/link';
import type { ReleaseStage } from '../../../config/release-stage';
import { landingContent } from '../content/landing-content';
import { HeroMotion } from '../motion/hero-motion';
import { ReleaseCta } from './release-cta';

interface HeroProps {
  releaseStage: ReleaseStage;
  downloadUrl?: URL | null;
}

export function Hero({ releaseStage, downloadUrl = null }: HeroProps) {
  return (
    <HeroMotion>
      <div className="wrap">
        <div className="column hero-grid">
          <div>
            <p className="eyebrow" data-hero="eyebrow">
              {landingContent.hero.eyebrow}
            </p>
            <h1 data-split>{landingContent.hero.heading}</h1>
            <p className="lede" data-hero="lede">
              {landingContent.hero.lede}
            </p>
            <div className="hero-actions" data-hero="cta">
              <ReleaseCta
                className="button button-solid"
                downloadUrl={downloadUrl}
                magnetic
                releaseStage={releaseStage}
              />
              <Link className="button button-quiet" href="#how">
                See how it works
              </Link>
            </div>
            <p className="hero-note" data-hero="note">
              {releaseStage === 'launched'
                ? 'Early access is open on Android.'
                : landingContent.hero.note}
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
              <div className="specimen" data-hero="entry">
                <div>
                  <span className="spec-word" data-hero="s1">
                    lucent
                  </span>
                  <span className="spec-gram" data-hero="s2">
                    adjective
                  </span>
                </div>
                <div className="spec-ipa" data-hero="s3">
                  /ˈluːs(ə)nt/
                </div>
                <p className="spec-def" data-hero="s4">
                  Softly bright; glowing with, or reflecting, light.
                </p>
                <div className="spec-meta" data-hero="s5">
                  <div>
                    Heard in <b>a podcast</b>, 12 August
                  </div>
                  <div>Near: luminous, radiant, translucent</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </HeroMotion>
  );
}
