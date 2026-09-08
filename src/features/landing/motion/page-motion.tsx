'use client';

import { useEffect } from 'react';
import { loadMotionEngine, motionIsAllowed, splitWords } from './shared-motion';

export function PageMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const header = document.querySelector<HTMLElement>('.site-header');
    const philosophy = document.querySelector<HTMLElement>('[data-theme-inversion]');
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-progress-node]'));
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-section][data-index]'),
    );
    let frame = 0;
    let disposed = false;
    let teardownMotion = () => undefined;

    const update = () => {
      frame = 0;
      header?.setAttribute('data-stuck', String(window.scrollY > 8));
      const midpoint = window.innerHeight / 2;
      const philosophyBounds = philosophy?.getBoundingClientRect();
      document.body.classList.toggle(
        'theme-night',
        Boolean(
          philosophyBounds &&
            philosophyBounds.top <= midpoint &&
            philosophyBounds.bottom >= midpoint,
        ),
      );
      for (const node of nodes) {
        const index = Number(node.dataset.progressNode);
        const section = sections.find((candidate) => Number(candidate.dataset.index) === index);
        const bounds = section?.getBoundingClientRect();
        node.dataset.active = String(
          Boolean(bounds && bounds.top <= midpoint && bounds.bottom >= midpoint),
        );
      }
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    update();

    if (motionIsAllowed()) {
      void loadMotionEngine()
        .then(({ gsap, ScrollTrigger }) => {
          if (disposed) return;
          gsap.registerPlugin(ScrollTrigger);
          const heading = philosophy?.querySelector<HTMLElement>('[data-split-scroll]');
          const split = heading ? splitWords(heading) : null;
          if (heading) heading.style.visibility = 'visible';
          const context = gsap.context(() => {
            gsap.to('[data-progress-fill]', {
              scaleY: 1,
              ease: 'none',
              scrollTrigger: { start: 0, end: 'max', scrub: true },
            });
            if (heading && split) {
              gsap.fromTo(
                split.wordElements,
                { y: '110%' },
                {
                  y: '0%',
                  stagger: 0.06,
                  duration: 0.8,
                  ease: 'power3.out',
                  scrollTrigger: { trigger: heading, start: 'top 78%', once: true },
                },
              );
            }
          });
          root.dataset.pageMotionReady = 'true';
          teardownMotion = () => {
            context.revert();
            split?.restore();
            delete root.dataset.pageMotionReady;
          };
        })
        .catch(() => {
          root.classList.remove('motion-enabled');
          root.classList.add('motion-fallback');
        });
    }

    return () => {
      disposed = true;
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
      teardownMotion();
      document.body.classList.remove('theme-night');
      header?.setAttribute('data-stuck', 'false');
      for (const node of nodes) node.dataset.active = 'false';
    };
  }, []);

  return null;
}
