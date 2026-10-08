import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollLexiconItem } from './living-lexicon.client';

afterEach(() => vi.unstubAllGlobals());

describe('scrollLexiconItem', () => {
  it.each(['auto', 'smooth'] as const)('uses native scrolling with %s behavior', (behavior) => {
    vi.stubGlobal('getComputedStyle', () => ({ paddingLeft: '24px' }));
    const scrollTo = vi.fn();
    const track = { scrollLeft: 12, scrollTop: 73, scrollTo };

    scrollLexiconItem(
      track as unknown as HTMLElement,
      { offsetLeft: 200 } as HTMLElement,
      behavior,
    );

    expect(scrollTo).toHaveBeenCalledWith({ left: 176, behavior });
    expect(scrollTo.mock.contexts[0]).toBe(track);
    expect(track.scrollLeft).toBe(12);
    expect(track.scrollTop).toBe(73);
  });

  it.each([undefined, null, 42])('scrolls horizontally when scrollTo is %s', (scrollTo) => {
    vi.stubGlobal('getComputedStyle', () => ({ paddingLeft: '24px' }));
    const track = { scrollLeft: 12, scrollTop: 73, scrollTo };

    scrollLexiconItem(
      track as unknown as HTMLElement,
      { offsetLeft: 200 } as HTMLElement,
      'smooth',
    );

    expect(track.scrollLeft).toBe(176);
    expect(track.scrollTop).toBe(73);
  });

  it.each([
    { paddingLeft: '24.5px', left: 175.5 },
    { paddingLeft: '', left: 200 },
  ])('aligns the fallback with padding "$paddingLeft"', ({ paddingLeft, left }) => {
    vi.stubGlobal('getComputedStyle', () => ({ paddingLeft }));
    const track = { scrollLeft: 12, scrollTop: 73 };

    scrollLexiconItem(track as HTMLElement, { offsetLeft: 200 } as HTMLElement, 'auto');

    expect(track.scrollLeft).toBe(left);
    expect(track.scrollTop).toBe(73);
  });
});
