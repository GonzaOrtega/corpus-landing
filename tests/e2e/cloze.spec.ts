import { expect, test } from '@playwright/test';

test('reveals the deterministic practice answer locally and reflects it in the lexicon', async ({
  page,
}) => {
  await page.goto('/');

  const reveal = page.getByRole('button', { name: 'Reveal the answer' });
  await reveal.click();

  await expect(reveal).toHaveText('lucent');
  await expect(
    page.getByText(
      'Correct. That word is now marked solid in your lexicon — you can find it below.',
    ),
  ).toBeVisible();

  await page.getByRole('button', { name: 'lucent' }).click();
  await expect(page.getByText('Solid — practised just now')).toBeVisible();
});
