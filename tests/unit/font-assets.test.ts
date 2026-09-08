import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type FontMetadata = {
  variationAxes: Record<string, { min: number; max: number }>;
  characterSet: number[];
};
type FontParser = (buffer: Buffer) => FontMetadata;
// Use the same WOFF2 parser bundled with the installed Next local-font loader.
const { default: fontkit } = createRequire(import.meta.url)(
  'next/dist/compiled/@next/font/dist/fontkit',
) as { default: FontParser | { default: FontParser } };
const parseFont = 'default' in fontkit ? fontkit.default : fontkit;

describe('shipped Newsreader subsets', () => {
  for (const style of ['normal', 'italic'] as const) {
    const font = parseFont(readFileSync(`app/fonts/newsreader-${style}.woff2`));

    it(`retains the reference optical-size and ${style} weight ranges`, () => {
      expect(font.variationAxes.opsz).toMatchObject({ min: 6, max: 72 });
      expect(font.variationAxes.wght).toMatchObject({
        min: 300,
        max: style === 'normal' ? 600 : 500,
      });
    });

    it(`retains English text and the available ${style} pronunciation glyphs`, () => {
      const ascii = Array.from({ length: 95 }, (_, index) => index + 32);
      // Upstream supplies these three pronunciation characters. Other IPA
      // symbols already use the system fallback in the authoritative design.
      const required = style === 'italic' ? [...ascii, 0x259, 0x14b, 0xf0] : ascii;
      expect(required.filter((codepoint) => !font.characterSet.includes(codepoint))).toEqual([]);
    });
  }
});
