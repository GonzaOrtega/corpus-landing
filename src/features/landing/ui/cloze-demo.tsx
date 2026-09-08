'use client';

import { useEffect, useState } from 'react';
import { PRACTICE_EVENT } from '../content/practice-event';

export function ClozeDemo() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const synchronize = () => setRevealed(true);
    window.addEventListener(PRACTICE_EVENT, synchronize);
    return () => window.removeEventListener(PRACTICE_EVENT, synchronize);
  }, []);

  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    window.dispatchEvent(new Event(PRACTICE_EVENT));
  };

  return (
    <>
      <p className="cloze">
        The water was{' '}
        <button
          aria-label="Reveal the answer"
          className="blank"
          data-revealed={revealed}
          onClick={reveal}
          type="button"
        >
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
