import { expect, test } from '@playwright/test';

test('matches the loaded optical-size reference geometry on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const heading = page.locator('#philosophy h2');
  await expect(heading).toHaveCSS('font-optical-sizing', 'auto');
  await expect(heading).toHaveCSS('font-size', '54.4px');
  await expect(heading).toHaveCSS('font-weight', '300');
  await expect(heading).toHaveCSS('font-style', 'italic');
  expect(
    await heading.evaluate((element) => {
      const family = getComputedStyle(element).fontFamily.split(',')[0].replaceAll('"', '').trim();
      return Array.from(document.fonts).some(
        (face) => face.family === family && face.style === 'italic' && face.status === 'loaded',
      );
    }),
  ).toBe(true);

  // Independently measured from landing-lexicon.html with Newsreader opsz 6..72
  // fully loaded, at this viewport. The fixed-opsz regression is 496×119.6875.
  const box = await heading.boundingBox();
  expect(box!.width).toBeCloseTo(512, 1);
  expect(box!.height).toBeCloseTo(59.84375, 1);
  expect(box!.x).toBeCloseTo(270, 1);
});
