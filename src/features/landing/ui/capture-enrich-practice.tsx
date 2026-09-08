import { landingContent } from '../content/landing-content';
import { ScrollytellingMotion } from '../motion/scrollytelling-motion';
import { ClozeDemo } from './cloze-demo';

export function StageVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="specimen state-specimen">
        <div className="spec-word">lucent</div>
        <p className="spec-def muted">Saved. Nothing else needed.</p>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="specimen state-specimen">
        <div>
          <span className="spec-word">lucent</span>
          <span className="spec-gram">adjective</span>
        </div>
        <p className="spec-ipa">/ˈluːs(ə)nt/</p>
        <p className="spec-def">Softly bright; glowing with, or reflecting, light.</p>
        <div className="spec-meta">
          <p>Near: luminous, radiant, translucent</p>
          <p>
            Register: <strong>literary</strong>
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="specimen state-specimen">
      <ClozeDemo />
    </div>
  );
}

export function CaptureEnrichPractice() {
  return (
    <ScrollytellingMotion>
      <div className="wrap">
        <div className="column">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>One word, three moments.</h2>
          </div>
          <div className="loop-grid">
            <div className="loop-stages">
              {landingContent.stages.map(([label, heading, body], index) => (
                <article className="stage" data-stage={index} key={label}>
                  <p className="stage-index">
                    <i aria-hidden="true" /> {label}
                  </p>
                  <h3>{heading}</h3>
                  <p>{body}</p>
                  <div className="mobile-stage-visual">
                    <StageVisual index={index} />
                  </div>
                </article>
              ))}
            </div>
            <div className="desktop-stage-visual">
              <div className="sticky">
                {[0, 1, 2].map((index) => (
                  <article className="state" data-state={index} key={index}>
                    <StageVisual index={index} />
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScrollytellingMotion>
  );
}
