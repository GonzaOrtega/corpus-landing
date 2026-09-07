import { demoLexicon } from '../content/demo-lexicon';
import { LivingLexiconClient } from './living-lexicon.client';

export function LivingLexicon() {
  return (
    <section className="section lexicon" id="lexicon">
      <div className="wrap column">
        <p className="eyebrow">Your living lexicon</p>
        <h2>Your vocabulary isn't a list.</h2>
        <p className="lede">
          It's a record of what you noticed, where you found it, and what you eventually made your
          own. Move through it — every word keeps the moments it came from.
        </p>
      </div>
      <LivingLexiconClient entries={demoLexicon} />
    </section>
  );
}
