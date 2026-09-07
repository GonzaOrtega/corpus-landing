import { expect, test } from '@playwright/test';

for (const [path, heading] of [
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
] as const) {
  test(`@smoke renders ${heading} with its canonical metadata`, async ({ page }) => {
    await page.goto(path);

    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new URL(path, page.url()).toString(),
    );
  });
}
