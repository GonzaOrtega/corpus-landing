import { landingContent } from '../content/landing-content';
import { ScrollytellingMotion } from '../motion/scrollytelling-motion';

export function CaptureEnrichPractice() {
  return (
    <ScrollytellingMotion>
      <div className="wrap column">
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
              </article>
            ))}
          </div>
          <div className="loop-stage-visual">
            <div className="sticky">
              <article className="state" data-state="0">
                <div className="specimen state-specimen">
                  <h3 className="spec-word">lucent</h3>
                  <p className="spec-def muted">Saved. Nothing else needed.</p>
                </div>
              </article>
              <article className="state" data-state="1">
                <div className="specimen state-specimen">
                  <h3 className="spec-word">
                    lucent <em className="spec-gram">adjective</em>
                  </h3>
                  <p className="spec-ipa">/ˈluːs(ə)nt/</p>
                  <p className="spec-def">Softly bright; glowing with, or reflecting, light.</p>
                  <div className="spec-meta">
                    <p>Near: luminous, radiant, translucent</p>
                    <p>
                      Register: <strong>literary</strong>
                    </p>
                  </div>
                </div>
              </article>
              <article className="state" data-state="2">
                <div className="specimen state-specimen">
                  <p className="cloze">
                    The water was <span className="blank">lucent</span> in the late afternoon.
                  </p>
                  <p className="practice-hint">A word returns in the context where it belongs.</p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </ScrollytellingMotion>
  );
}
