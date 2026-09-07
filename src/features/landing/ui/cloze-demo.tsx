'use client';

import { useState } from 'react';

const PRACTICE_EVENT = 'corpus:practice-lucent';

export function ClozeDemo() {
  const [revealed, setRevealed] = useState(false);

  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    window.dispatchEvent(new Event(PRACTICE_EVENT));
  };

  return (
    <>
      <p className="cloze">
        The water was{' '}
        <button aria-label="Reveal the answer" className="blank" onClick={reveal} type="button">
          {revealed ? 'lucent' : '\u00a0'}
        </button>{' '}
        in the late afternoon.
      </p>
      <p className="practice-hint">
        {revealed
          ? 'Correct. That word is now marked solid in your lexicon — you can find it below.'
          : 'Tap the blank to reveal it.'}
      </p>
    </>
  );
}
