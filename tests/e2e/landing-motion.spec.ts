import { expect, test } from '@playwright/test';

test.describe('landing motion progressive enhancement', () => {
  test.use({ javaScriptEnabled: false });

  test('pairs each mobile stage with its readable specimen in server HTML', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    for (const index of [0, 1, 2]) {
      const state = page.locator(`[data-stage="${index}"] > [data-state="${index}"]`);
      await expect(state).toBeVisible();
    }
    await expect(page.locator('.sticky > .state')).toHaveCount(0);
  });

  test('keeps the hero, navigation, and all three learning states readable without JavaScript', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Learn words from real life.' }),
    ).toBeVisible();
    await expect(
      page.locator('#top').getByRole('link', { name: 'Join early access' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Type it and move on.' }),
    ).toBeVisible();
    await expect(page.getByText('Saved. Nothing else needed.')).toBeVisible();
    await expect(
      page.locator('#top').getByText('Near: luminous, radiant, translucent'),
    ).toBeVisible();
    await expect(page.getByText('The water was')).toBeVisible();
  });
});

test('does not prepare hidden or translated animation states when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('[data-motion-island="hero"]')).not.toHaveAttribute(
    'data-motion-ready',
    'true',
  );
  await expect(page.locator('[data-motion-island="scrollytelling"]')).not.toHaveAttribute(
    'data-motion-ready',
    'true',
  );

  for (const locator of [
    page.getByRole('heading', { level: 1, name: 'Learn words from real life.' }),
    page.getByRole('heading', { level: 3, name: 'The entry fills itself in.' }),
    page.locator('[data-state="0"]'),
  ]) {
    await expect(locator).toBeVisible();
    await expect(locator).toHaveCSS('opacity', '1');
    await expect(locator).toHaveCSS('transform', 'none');
  }
});
