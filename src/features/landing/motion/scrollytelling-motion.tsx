'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { loadMotionEngine, motionIsAllowed } from './shared-motion';

export function ScrollytellingMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionIsAllowed()) return;

    let disposed = false;
    let teardown = () => undefined;

    void loadMotionEngine().then(({ gsap, ScrollTrigger }) => {
      if (disposed) return;

      gsap.registerPlugin(ScrollTrigger);
      root.dataset.motionReady = 'true';
      const desktop = gsap.matchMedia();
      const context = gsap.context(() => {
        for (const stage of root.querySelectorAll<HTMLElement>('[data-stage]')) {
          gsap.from(stage.children, {
            opacity: 0,
            y: 18,
            duration: 0.7,
            stagger: 0.1,
            ease: 'power2.out',
            scrollTrigger: { trigger: stage, start: 'top 75%', once: true },
          });
        }

        desktop.add('(min-width: 881px)', () => {
          const states = Array.from(root.querySelectorAll<HTMLElement>('[data-state]'));
          const show = (activeIndex: number) => {
            for (const [index, state] of states.entries()) {
              gsap.to(state, {
                opacity: index === activeIndex ? 1 : 0,
                duration: 0.45,
                ease: 'power2.out',
                overwrite: true,
              });
            }
          };

          for (const stage of root.querySelectorAll<HTMLElement>('[data-stage]')) {
            const index = Number(stage.dataset.stage ?? 0);
            ScrollTrigger.create({
              trigger: stage,
              start: 'top 60%',
              end: 'bottom 40%',
              onEnter: () => show(index),
              onEnterBack: () => show(index),
            });
          }
        });
      }, root);

      teardown = () => {
        desktop.revert();
        context.revert();
        delete root.dataset.motionReady;
      };
    });

    return () => {
      disposed = true;
      teardown();
    };
  }, []);

  return (
    <section className="section loop" data-motion-island="scrollytelling" id="how" ref={rootRef}>
      {children}
    </section>
  );
}
