import { expect, test } from '@playwright/test';

test('loads the approved typefaces within the initial font transfer budget', async ({ page }) => {
  const fontBodies: Promise<number>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'font') {
      fontBodies.push(response.body().then((body) => body.byteLength));
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  expect(fontBodies.length).toBeGreaterThan(0);
  expect((await Promise.all(fontBodies)).reduce((total, size) => total + size, 0)).toBeLessThan(
    200 * 1024,
  );
  await expect(page.locator('h1')).toHaveCSS('font-family', /Newsreader/);
  await expect(page.locator('body')).toHaveCSS('font-family', /Karla/);
});
