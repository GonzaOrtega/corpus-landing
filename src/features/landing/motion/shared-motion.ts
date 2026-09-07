import type { gsap as Gsap } from 'gsap';

export type MotionEngine = typeof Gsap;

export function motionIsAllowed() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export async function loadMotionEngine() {
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ]);

  return { gsap, ScrollTrigger };
}

export function splitWords(element: HTMLElement) {
  const originalText = element.textContent ?? '';
  const words = originalText.trim().split(/\s+/);

  element.replaceChildren();
  const wordElements = words.map((word, index) => {
    const mask = document.createElement('span');
    const inner = document.createElement('span');
    mask.className = 'motion-word-mask';
    inner.className = 'motion-word';
    inner.textContent = word;
    mask.appendChild(inner);
    element.appendChild(mask);
    if (index < words.length - 1) element.appendChild(document.createTextNode(' '));
    return inner;
  });

  return {
    restore: () => element.replaceChildren(document.createTextNode(originalText)),
    wordElements,
  };
}

export function installPointerMotion(gsap: MotionEngine, root: HTMLElement) {
  if (!window.matchMedia('(pointer: fine)').matches) return () => undefined;

  const cleanups: Array<() => void> = [];
  const layers = Array.from(root.querySelectorAll<SVGGElement>('[data-depth]')).map((layer) => ({
    depth: Number(layer.dataset.depth ?? 0),
    xTo: gsap.quickTo(layer, 'x', { duration: 0.9, ease: 'power3.out' }),
    yTo: gsap.quickTo(layer, 'y', { duration: 0.9, ease: 'power3.out' }),
  }));

  const moveLayers = (event: PointerEvent) => {
    const normalizedX = (event.clientX / window.innerWidth - 0.5) * 2;
    const normalizedY = (event.clientY / window.innerHeight - 0.5) * 2;
    for (const layer of layers) {
      layer.xTo(normalizedX * 14 * layer.depth);
      layer.yTo(normalizedY * 10 * layer.depth);
    }
  };
  window.addEventListener('pointermove', moveLayers, { passive: true });
  cleanups.push(() => window.removeEventListener('pointermove', moveLayers));

  for (const target of root.querySelectorAll<HTMLElement>('[data-magnetic]')) {
    const xTo = gsap.quickTo(target, 'x', { duration: 0.5, ease: 'power3.out' });
    const yTo = gsap.quickTo(target, 'y', { duration: 0.5, ease: 'power3.out' });
    const moveTarget = (event: PointerEvent) => {
      const bounds = target.getBoundingClientRect();
      xTo((event.clientX - (bounds.left + bounds.width / 2)) * 0.28);
      yTo((event.clientY - (bounds.top + bounds.height / 2)) * 0.4);
    };
    const resetTarget = () => {
      xTo(0);
      yTo(0);
    };
    target.addEventListener('pointermove', moveTarget);
    target.addEventListener('pointerleave', resetTarget);
    cleanups.push(() => {
      target.removeEventListener('pointermove', moveTarget);
      target.removeEventListener('pointerleave', resetTarget);
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
