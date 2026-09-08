import { expect, test } from '@playwright/test';

test('stays at the hero through hydration while the Lexicon is off-screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  await page.waitForTimeout(1_000);

  expect(
    await page.evaluate(() => ({
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      bodyTop: document.body.scrollTop,
      documentTop: document.scrollingElement?.scrollTop ?? -1,
      hash: location.hash,
    })),
  ).toEqual({ bodyOverflowY: 'visible', bodyTop: 0, documentTop: 0, hash: '' });
});

test('keeps an anchor destination stable after hydration', async ({ page }) => {
  await page.goto('/#how');
  await page.waitForTimeout(1_000);
  await expect(page.locator('#how')).toBeInViewport();
  await expect(page.locator('#lexicon')).not.toBeInViewport();
});

test('uses the approved foundation and page-level scroll choreography', async ({ page }) => {
  await page.goto('/');
  expect(
    await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor),
  ).toBe('rgb(241, 239, 233)');
  await expect(page.locator('.site-header')).toHaveAttribute('data-stuck', 'false');
  await expect(page.locator('.site-header')).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByRole('link', { name: 'How it works', exact: true })).toHaveCSS(
    'text-decoration-line',
    'none',
  );

  await page.mouse.wheel(0, 200);
  await expect(page.locator('.site-header')).toHaveAttribute('data-stuck', 'true');
  await page.locator('#philosophy').scrollIntoViewIfNeeded();
  await expect(page.locator('body')).toHaveClass(/theme-night/);
  await expect(page.locator('[data-progress-node="3"]')).toHaveAttribute('data-active', 'true');
  await page.locator('#early-access').scrollIntoViewIfNeeded();
  await expect(page.locator('body')).not.toHaveClass(/theme-night/);
});

test('@smoke renders the primary landing journey and anchor navigation', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Learn words from real life.' }),
  ).toBeVisible();
  await expect(page.locator('.site-header')).toHaveCSS('position', 'sticky');
  await expect(page.locator('.progress-spine')).toBeVisible();

  await page.getByRole('link', { name: 'See how it works' }).click();
  await expect(page.locator('#how')).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'One word, three moments.' })).toBeVisible();
  await expect(page.locator('[data-theme="inverted"]')).toBeVisible();
});

test('@mobile keeps the navigation, learning flow, and signup CTA visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Your vocabulary isn't a list." })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join early access' }).first()).toBeVisible();
});
