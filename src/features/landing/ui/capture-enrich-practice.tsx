import { landingContent } from '../content/landing-content';
import { ScrollytellingMotion } from '../motion/scrollytelling-motion';
import { ClozeDemo } from './cloze-demo';

export function CaptureEnrichPractice() {
  const specimens = [
    <article className="state" data-state="0" key="capture">
      <div className="specimen state-specimen">
        <span className="spec-word">lucent</span>
        <p className="spec-def muted">Saved. Nothing else needed.</p>
      </div>
    </article>,
    <article className="state" data-state="1" key="enrich">
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
    </article>,
    <article className="state" data-state="2" key="practice">
      <div className="specimen state-specimen">
        <ClozeDemo />
      </div>
    </article>,
  ];
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
                  <span className="stage-index">
                    <i aria-hidden="true" /> {label}
                  </span>
                  <h3>{heading}</h3>
                  <p>{body}</p>
                  {specimens[index]}
                </article>
              ))}
            </div>
            <div className="loop-stage-visual">
              <div className="sticky" />
            </div>
          </div>
        </div>
      </div>
    </ScrollytellingMotion>
  );
}
