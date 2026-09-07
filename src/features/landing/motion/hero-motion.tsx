'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import {
  installPointerMotion,
  loadMotionEngine,
  motionIsAllowed,
  splitWords,
} from './shared-motion';

export function HeroMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionIsAllowed()) return;

    let disposed = false;
    let teardown = () => undefined;

    void loadMotionEngine().then(({ gsap }) => {
      if (disposed) return;

      const headline = root.querySelector<HTMLElement>('[data-split]');
      const typed = root.querySelector<HTMLElement>('[data-typed]');
      const caret = root.querySelector<HTMLElement>('[data-caret]');
      if (!headline || !typed || !caret) return;

      const split = splitWords(headline);
      const fullWord = typed.textContent ?? '';
      typed.textContent = '';
      root.dataset.motionReady = 'true';

      const context = gsap.context(() => {
        for (const path of root.querySelectorAll<SVGGeometryElement>('.hero-geo .draw')) {
          const length = path.getTotalLength();
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
        }

        gsap.set('.hero-geo', { opacity: 1 });
        const typing = { index: 0 };
        const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

        timeline
          .to('.hero-geo .draw', { strokeDashoffset: 0, duration: 1.4, stagger: 0.14 }, 0)
          .to('.hero-geo .mark-diamond', { opacity: 1, duration: 0.6 }, 0.9)
          .to('[data-hero="eyebrow"]', { opacity: 1, duration: 0.6 }, 0.5)
          .to(split.wordElements, { y: '0%', duration: 1, stagger: 0.07, ease: 'power4.out' }, 0.6)
          .to('[data-hero="lede"]', { opacity: 1, duration: 0.7 }, 1.2)
          .to('[data-hero="field"]', { opacity: 1, duration: 0.45 }, 1.1)
          .to(
            typing,
            {
              index: fullWord.length,
              duration: 0.75,
              ease: 'none',
              onUpdate: () => {
                typed.textContent = fullWord.slice(0, Math.round(typing.index));
              },
            },
            1.35,
          )
          .to(caret, { opacity: 0, duration: 0.25 }, 2.15)
          .to('[data-hero="tag"]', { opacity: 1, duration: 0.4 }, 2.2)
          .to('[data-hero="entry"]', { opacity: 1, duration: 0.3 }, 2.25)
          .to('[data-hero="entry"] > *', { opacity: 1, duration: 0.5, stagger: 0.13 }, 2.35)
          .to('[data-hero="cta"]', { opacity: 1, duration: 0.6 }, 2.7)
          .to('[data-hero="note"]', { opacity: 1, duration: 0.6 }, 2.9);

        gsap.to(caret, {
          opacity: 0.15,
          duration: 0.3,
          repeat: 2,
          yoyo: true,
          ease: 'none',
          delay: 1.2,
        });
      }, root);
      const removePointerMotion = installPointerMotion(gsap, root);

      teardown = () => {
        removePointerMotion();
        context.revert();
        split.restore();
        typed.textContent = fullWord;
        delete root.dataset.motionReady;
      };
    });

    return () => {
      disposed = true;
      teardown();
    };
  }, []);

  return (
    <section className="hero" data-motion-island="hero" id="top" ref={rootRef}>
      {children}
    </section>
  );
}
