import { expect, test } from '@playwright/test';

test('rejects an incomplete email before attempting a signup', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Email address').fill('not-an-email');
  await page.getByRole('button', { name: 'Join the list' }).click();

  await expect(
    page.getByText('That address looks incomplete. Check it and try again.'),
  ).toBeVisible();
});

test('keeps signup status polite and non-enumerating', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.signup-status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByText(/No newsletter\. Unsubscribe anytime\./)).toBeVisible();
});
