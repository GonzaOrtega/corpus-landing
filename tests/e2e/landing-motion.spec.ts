import { expect, test } from '@playwright/test';

test.describe('landing motion progressive enhancement', () => {
  test.use({ javaScriptEnabled: false });

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
