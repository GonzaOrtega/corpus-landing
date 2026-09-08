import { expect, test } from '@playwright/test';

test('reveals the deterministic practice answer locally and reflects it in the lexicon', async ({
  page,
}) => {
  await page.goto('/');

  const desktop = page.locator('.desktop-stage-visual');
  const reveal = desktop.getByRole('button', { name: 'Reveal the answer' });
  await reveal.click();

  await expect(reveal).toHaveText('lucent');
  await expect(
    desktop.getByText(
      'Correct. That word is now marked solid in your lexicon — you can find it below.',
    ),
  ).toBeVisible();

  await page.getByRole('button', { name: 'lucent' }).click();
  await expect(page.getByText('Solid — practised just now')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePractice = page.locator('[data-stage="2"]');
  await expect(mobilePractice.getByRole('button', { name: 'Reveal the answer' })).toHaveText(
    'lucent',
  );
  await expect(
    mobilePractice.getByText(
      'Correct. That word is now marked solid in your lexicon — you can find it below.',
    ),
  ).toBeVisible();
});
