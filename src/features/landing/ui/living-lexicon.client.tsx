'use client';

import { useEffect, useRef, useState } from 'react';
import type { DemoLexiconEntry } from '../content/demo-lexicon';

const AUTOPLAY_MS = 5_000;
const RESUME_AFTER_IDLE_MS = 7_000;
const PRACTICE_EVENT = 'corpus:practice-lucent';

export function LivingLexiconClient({ entries }: { entries: readonly DemoLexiconEntry[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [practised, setPractised] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    startIndex: number;
    moved: boolean;
  } | null>(null);

  const activeEntry = entries[activeIndex] ?? entries[0];
  const activeState =
    activeEntry.word === 'lucent' && practised ? 'Solid — practised just now' : activeEntry.state;

  useEffect(() => {
    setIsHydrated(true);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReducedMotion(media.matches);
    updateMotionPreference();
    media.addEventListener('change', updateMotionPreference);

    const markPractised = () => setPractised(true);
    window.addEventListener(PRACTICE_EVENT, markPractised);
    return () => {
      media.removeEventListener('change', updateMotionPreference);
      window.removeEventListener(PRACTICE_EVENT, markPractised);
    };
  }, []);

  useEffect(() => {
    if (isPaused || reducedMotion || !isHydrated) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current === entries.length - 1 ? current - 1 : current + 1));
    }, AUTOPLAY_MS);
    return () => window.clearInterval(interval);
  }, [entries.length, isHydrated, isPaused, reducedMotion]);

  useEffect(() => {
    const track = trackRef.current;
    const activeButton = track?.querySelector<HTMLButtonElement>(
      `[data-lexicon-index="${activeIndex}"]`,
    );
    activeButton?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', inline: 'start' });
  }, [activeIndex, reducedMotion]);

  const stopThenResume = () => {
    if (isPaused || reducedMotion) return;
    window.clearTimeout(resumeTimerRef.current ?? undefined);
    setIsPaused(true);
    resumeTimerRef.current = window.setTimeout(() => setIsPaused(false), RESUME_AFTER_IDLE_MS);
  };

  const select = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(entries.length - 1, index)));
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;
    dragRef.current = null;
    delete track.dataset.dragging;
    if (!drag.moved) return;
    stopThenResume();
  };

  return (
    <div className="browser" data-autoplay-running={!isPaused && !reducedMotion}>
      <section
        aria-label="Word browser. Drag, or use the previous and next controls, to move through your lexicon."
        className="lex-track"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            const nextIndex = Math.min(entries.length - 1, activeIndex + 1);
            select(nextIndex);
            trackRef.current
              ?.querySelector<HTMLButtonElement>(`[data-lexicon-index="${nextIndex}"]`)
              ?.focus();
            stopThenResume();
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            const nextIndex = Math.max(0, activeIndex - 1);
            select(nextIndex);
            trackRef.current
              ?.querySelector<HTMLButtonElement>(`[data-lexicon-index="${nextIndex}"]`)
              ?.focus();
            stopThenResume();
          }
        }}
        onPointerDown={(event) => {
          const track = trackRef.current;
          if (!track) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: track.scrollLeft,
            startIndex: activeIndex,
            moved: false,
          };
          track.dataset.dragging = 'true';
          track.setPointerCapture(event.pointerId);
          stopThenResume();
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const track = trackRef.current;
          if (!drag || drag.pointerId !== event.pointerId || !track) return;
          const distance = event.clientX - drag.startX;
          drag.moved ||= Math.abs(distance) > 8;
          if (Math.abs(distance) > 80) {
            select(drag.startIndex + (distance < 0 ? 1 : -1));
          }
          track.scrollLeft = drag.startScrollLeft - distance;
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        ref={trackRef}
      >
        {entries.map((entry, index) => (
          <button
            aria-current={index === activeIndex ? 'true' : undefined}
            className="lex-item"
            data-lexicon-index={index}
            key={entry.word}
            onClick={() => {
              select(index);
              stopThenResume();
            }}
            onFocus={() => select(index)}
            type="button"
          >
            {entry.word}
          </button>
        ))}
      </section>

      <div className="wrap column">
        <div aria-hidden="true" className="lex-underline">
          <i />
          <b />
        </div>
        <div className="lex-controls">
          <button
            aria-pressed={isPaused}
            className="lex-pause"
            hidden={!isHydrated || reducedMotion}
            onClick={() => {
              window.clearTimeout(resumeTimerRef.current ?? undefined);
              setIsPaused((paused) => !paused);
            }}
            type="button"
          >
            {isPaused ? 'Play the word browser' : 'Pause the word browser'}
          </button>
          <span aria-live="polite" className="sr-only">
            {activeIndex + 1} of {entries.length}
          </span>
        </div>
        <article aria-live={isPaused ? 'polite' : 'off'} className="lex-detail">
          <div>
            <p className="lex-gram">
              {activeEntry.partOfSpeech} · <span className="ipa">{activeEntry.pronunciation}</span>
            </p>
            <p className="spec-def">{activeEntry.definition}</p>
            <p className="lex-state">
              <i aria-hidden="true" /> {activeState}
            </p>
          </div>
          <div className="lex-encounters">
            {activeEntry.encounters.map((encounter) => (
              <div
                className="encounter"
                data-empty={encounter.empty || undefined}
                key={encounter.label}
              >
                <span className="when">{encounter.label}</span>
                <span className="where">{encounter.detail}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
