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
    await expect(
      page.locator('[data-stage="0"]').getByText('Saved. Nothing else needed.'),
    ).toBeVisible();
    await expect(
      page.locator('[data-stage="1"]').getByText('Near: luminous, radiant, translucent'),
    ).toBeVisible();
    await expect(page.locator('[data-stage="2"]').getByText('The water was')).toBeVisible();
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
    page.locator('[data-stage="0"]').getByText('Saved. Nothing else needed.'),
  ]) {
    await expect(locator).toBeVisible();
    await expect(locator).toHaveCSS('opacity', '1');
    await expect(locator).toHaveCSS('transform', 'none');
  }
});

test('pairs each stage with its visual on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#how');
  await expect(
    page.locator('[data-stage="0"]').getByText('Saved. Nothing else needed.'),
  ).toBeVisible();
  await expect(
    page.locator('[data-stage="1"]').getByText('Near: luminous, radiant, translucent'),
  ).toBeVisible();
  await expect(page.locator('[data-stage="2"]').getByText('The water was')).toBeVisible();
  await expect(page.locator('.desktop-stage-visual')).toBeHidden();
});

test('keeps one sticky visual stack on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#how');
  await expect(page.locator('.mobile-stage-visual').first()).toBeHidden();
  const boxes = await page.locator('.desktop-stage-visual [data-state]').evaluateAll((states) =>
    states.map((state) => {
      const box = state.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width) };
    }),
  );
  expect(new Set(boxes.map((box) => JSON.stringify(box))).size).toBe(1);
});
