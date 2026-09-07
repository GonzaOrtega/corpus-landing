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
  const progressRef = useRef<HTMLElement>(null);
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
      window.clearTimeout(resumeTimerRef.current ?? undefined);
      media.removeEventListener('change', updateMotionPreference);
      window.removeEventListener(PRACTICE_EVENT, markPractised);
    };
  }, []);

  useEffect(() => {
    if (isPaused || reducedMotion || !isHydrated) return;
    let frame = 0;
    let started = performance.now();
    const paintProgress = (now: number) => {
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${Math.min(1, (now - started) / AUTOPLAY_MS)})`;
      }
      frame = window.requestAnimationFrame(paintProgress);
    };
    frame = window.requestAnimationFrame(paintProgress);
    const interval = window.setInterval(() => {
      started = performance.now();
      setActiveIndex((current) => (current === entries.length - 1 ? current - 1 : current + 1));
    }, AUTOPLAY_MS);
    return () => {
      window.clearInterval(interval);
      window.cancelAnimationFrame(frame);
    };
  }, [entries.length, isHydrated, isPaused, reducedMotion]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const paint = () => {
      const inset = Number.parseFloat(getComputedStyle(track).paddingLeft);
      const focusX = track.getBoundingClientRect().left + inset;
      const reach = Math.max(200, Math.min(track.clientWidth * 0.4, 320));
      for (const item of track.querySelectorAll<HTMLElement>('.lex-item')) {
        const distance = Math.min(Math.abs(item.getBoundingClientRect().left - focusX) / reach, 1);
        item.style.opacity = String(0.06 + (1 - distance) ** 1.6 * 0.94);
      }
    };
    track.addEventListener('scroll', paint, { passive: true });
    const observer = new ResizeObserver(paint);
    observer.observe(track);
    paint();
    return () => {
      track.removeEventListener('scroll', paint);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    const activeButton = track?.querySelector<HTMLButtonElement>(
      `[data-lexicon-index="${activeIndex}"]`,
    );
    if (track && activeButton) {
      const inset = Number.parseFloat(getComputedStyle(track).paddingLeft);
      // Move only the archive: autoplay must never move the document.
      track.scrollTo({
        left:
          track.scrollLeft +
          activeButton.getBoundingClientRect().left -
          track.getBoundingClientRect().left -
          inset,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
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
    <div className="browser" data-autoplay-running={isHydrated && !isPaused && !reducedMotion}>
      {/* biome-ignore lint/a11y/useSemanticElements: This is a word navigation group, not a form fieldset. */}
      <div
        role="group"
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
      </div>

      <div className="wrap">
        <div className="column">
          <div
            aria-hidden="true"
            className="lex-underline"
            data-running={isHydrated && !isPaused && !reducedMotion}
          >
            <i ref={progressRef} />
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
                {activeEntry.partOfSpeech} ·{' '}
                <span className="ipa">{activeEntry.pronunciation}</span>
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
                  <span className="where">
                    {encounter.detail}
                    {encounter.emphasis && <em>{encounter.emphasis}</em>}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
