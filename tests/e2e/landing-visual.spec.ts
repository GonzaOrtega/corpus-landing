import { expect, test } from '@playwright/test';

test.use({ colorScheme: 'light', reducedMotion: 'reduce' });

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`${viewport.name} landing matches the approved composition`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('nextjs-portal').evaluateAll((portals) => {
      for (const portal of portals) portal.remove();
    });
    await expect(page).toHaveScreenshot(`landing-${viewport.name}.png`, {
      animations: 'disabled',
      fullPage: true,
    });
  });
}
