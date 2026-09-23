import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  element: null as ReactElement | null,
  options: null as unknown,
}));

// next/og rasterises through a WASM renderer; the element tree it receives is
// the contract worth asserting here.
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactElement, options: unknown) {
      captured.element = element;
      captured.options = options;
    }
  },
}));

import OpenGraphImage, { alt, contentType, size } from './opengraph-image';

describe('Open Graph image', () => {
  it('declares the standard 1200×630 PNG with a descriptive alt', () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
    expect(alt).toBe('Corpus — Learn words from real life.');
  });

  it('renders the brand mark, tagline and stage line at the declared size', () => {
    OpenGraphImage();

    expect(captured.options).toBe(size);
    const html = renderToStaticMarkup(captured.element as ReactElement);
    expect(html).toContain('Learn words from real life.');
    expect(html).toContain('Capture · Enrich · Practice');
    expect(html).toContain('rotate(45deg)');
  });
});
