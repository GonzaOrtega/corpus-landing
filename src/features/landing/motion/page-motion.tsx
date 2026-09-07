'use client';

import { useEffect } from 'react';

/** A single scroll observer keeps the page chrome in sync with the document. */
export function PageMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site-header');
    const fill = document.querySelector<HTMLElement>('.progress-fill');
    const nodes = document.querySelectorAll<HTMLElement>('.progress-node');
    const sections = ['top', 'how', 'lexicon', 'philosophy', 'early-access'].map((id) =>
      document.getElementById(id),
    );
    let frame = 0;
    let disposed = false;
    const update = () => {
      frame = 0;
      const height = window.innerHeight;
      const available = document.documentElement.scrollHeight - height;
      const progress = available > 0 ? Math.max(0, Math.min(1, window.scrollY / available)) : 0;
      if (header) header.dataset.stuck = String(window.scrollY > 8);
      if (fill) fill.style.transform = `scaleY(${progress})`;
      for (const [index, section] of sections.entries()) {
        const rect = section?.getBoundingClientRect();
        if (!rect) continue;
        const node = nodes[index];
        if (node) node.dataset.on = String(rect.top < height * 0.55 && rect.bottom > height * 0.45);
        if (section?.id === 'philosophy') {
          document.body.classList.toggle(
            'theme-night',
            rect.top < height * 0.5 && rect.bottom > height * 0.5,
          );
        }
      }
    };
    const schedule = () => {
      if (!disposed && !frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    void document.fonts.ready.then(schedule);
    update();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.body.classList.remove('theme-night');
      if (header) delete header.dataset.stuck;
      fill?.style.removeProperty('transform');
      for (const node of nodes) delete node.dataset.on;
    };
  }, []);
  return null;
}
