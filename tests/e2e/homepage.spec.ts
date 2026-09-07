import { expect, test } from '@playwright/test';

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
