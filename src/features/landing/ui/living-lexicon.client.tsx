'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoLexiconEntry } from '../content/demo-lexicon';
import { PRACTICE_EVENT } from '../content/practice-event';

const AUTOPLAY_MS = 5_000;
const RESUME_AFTER_IDLE_MS = 7_000;

export function scrollLexiconItem(track: HTMLElement, item: HTMLElement, behavior: ScrollBehavior) {
  const inset = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
  track.scrollTo({ left: item.offsetLeft - inset, behavior });
}

export function LivingLexiconClient({ entries }: { entries: readonly DemoLexiconEntry[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [practised, setPractised] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [userDriven, setUserDriven] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const scrollSelectionRef = useRef(false);
  const programmaticTargetRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);

  const activeEntry = entries[activeIndex] ?? entries[0];
  const activeState =
    activeEntry.word === 'lucent' && practised ? 'Solid — practised just now' : activeEntry.state;
  const autoplayRunning =
    hydrated && isInView && !userPaused && !interactionPaused && !reducedMotion;

  const select = useCallback(
    (index: number, fromUser = false, scroll = true) => {
      scrollSelectionRef.current = !scroll;
      setActiveIndex(Math.max(0, Math.min(entries.length - 1, index)));
      setUserDriven(fromUser);
    },
    [entries.length],
  );

  const pauseForInteraction = useCallback(() => {
    if (reducedMotion) return;
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    setInteractionPaused(true);
    resumeTimerRef.current = window.setTimeout(() => {
      setInteractionPaused(false);
      setUserDriven(false);
    }, RESUME_AFTER_IDLE_MS);
  }, [reducedMotion]);

  useEffect(() => {
    setHydrated(true);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener('change', updateMotion);
    const markPractised = () => setPractised(true);
    window.addEventListener(PRACTICE_EVENT, markPractised);
    return () => {
      media.removeEventListener('change', updateMotion);
      window.removeEventListener(PRACTICE_EVENT, markPractised);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry?.isIntersecting ?? false),
      { threshold: 0.35 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoplayRunning) return;
    setProgressKey((key) => key + 1);
    const interval = window.setInterval(() => {
      scrollSelectionRef.current = false;
      setUserDriven(false);
      setActiveIndex((current) => {
        if (current >= entries.length - 1) directionRef.current = -1;
        else if (current <= 0) directionRef.current = 1;
        return current + directionRef.current;
      });
      setProgressKey((key) => key + 1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(interval);
  }, [autoplayRunning, entries.length]);

  useEffect(() => {
    if (scrollSelectionRef.current) {
      scrollSelectionRef.current = false;
      return;
    }
    const track = trackRef.current;
    const item = track?.querySelector<HTMLElement>(`[data-lexicon-index="${activeIndex}"]`);
    if (track && item) {
      const inset = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const target = item.offsetLeft - inset;
      programmaticTargetRef.current = Math.abs(track.scrollLeft - target) <= 1 ? null : target;
      scrollLexiconItem(track, item, reducedMotion ? 'auto' : 'smooth');
    }
  }, [activeIndex, reducedMotion]);

  useEffect(
    () => () => {
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  const synchronizeFromTrack = () => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const track = trackRef.current;
      if (!track) return;
      const inset = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const focus = track.scrollLeft + inset;
      const items = Array.from(track.querySelectorAll<HTMLElement>('[data-lexicon-index]'));
      let nearestIndex = activeIndex;
      let nearestDistance = Number.POSITIVE_INFINITY;
      const range = Math.max(track.clientWidth * 0.55, 1);
      for (const [index, item] of items.entries()) {
        const distance = Math.abs(item.offsetLeft - focus);
        const ratio = Math.min(distance / range, 1);
        item.style.opacity = String(0.5 + (1 - ratio) ** 1.6 * 0.5);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
      const programmaticTarget = programmaticTargetRef.current;
      if (programmaticTarget !== null) {
        if (Math.abs(track.scrollLeft - programmaticTarget) <= 1) {
          programmaticTargetRef.current = null;
        }
        return;
      }
      if (nearestIndex !== activeIndex) select(nearestIndex, userDriven, false);
    });
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;
    dragRef.current = null;
    delete track.dataset.dragging;
    const item = track.querySelector<HTMLElement>(`[data-lexicon-index="${activeIndex}"]`);
    if (item) scrollLexiconItem(track, item, reducedMotion ? 'auto' : 'smooth');
    if (drag.moved) pauseForInteraction();
  };

  return (
    <div
      className="browser"
      data-autoplay-running={autoplayRunning}
      data-running={autoplayRunning}
      ref={rootRef}
    >
      <section
        aria-label="Word browser. Drag, swipe, click a word, or use the arrow keys to move through your lexicon."
        className="lex-track"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const next = Math.max(
            0,
            Math.min(entries.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)),
          );
          select(next, true);
          pauseForInteraction();
          trackRef.current
            ?.querySelector<HTMLButtonElement>(`[data-lexicon-index="${next}"]`)
            ?.focus();
        }}
        onPointerDown={(event) => {
          const track = trackRef.current;
          if (!track) return;
          programmaticTargetRef.current = null;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: track.scrollLeft,
            moved: false,
          };
          track.dataset.dragging = 'true';
          track.setPointerCapture(event.pointerId);
          setUserDriven(true);
          pauseForInteraction();
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const track = trackRef.current;
          if (!drag || drag.pointerId !== event.pointerId || !track) return;
          const distance = event.clientX - drag.startX;
          drag.moved ||= Math.abs(distance) > 8;
          track.scrollLeft = drag.startScrollLeft - distance;
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onScroll={synchronizeFromTrack}
        onWheel={() => {
          setUserDriven(true);
          pauseForInteraction();
        }}
        ref={trackRef}
      >
        {entries.map((entry, index) => (
          <button
            aria-current={index === activeIndex ? 'true' : undefined}
            className="lex-item"
            data-lexicon-index={index}
            key={entry.word}
            onClick={() => {
              select(index, true);
              pauseForInteraction();
            }}
            onFocus={() => {
              select(index, true);
              pauseForInteraction();
            }}
            type="button"
          >
            {entry.word}
          </button>
        ))}
      </section>

      <div className="wrap column">
        <div className="lex-underline" data-running={autoplayRunning}>
          <i key={progressKey} />
          <b />
        </div>
        <div className="lex-controls">
          <button
            aria-pressed={userPaused}
            className="lex-pause"
            hidden={reducedMotion}
            onClick={() => {
              if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
              setInteractionPaused(false);
              setUserPaused((paused) => !paused);
              setUserDriven(true);
            }}
            type="button"
          >
            {userPaused ? 'Play the word browser' : 'Pause the word browser'}
          </button>
          <span aria-live={userDriven ? 'polite' : 'off'} className="sr-only">
            {activeIndex + 1} of {entries.length}
          </span>
        </div>
        <article aria-live={userDriven ? 'polite' : 'off'} className="lex-detail">
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
