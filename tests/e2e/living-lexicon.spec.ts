import { expect, test } from '@playwright/test';

test.describe('Living Lexicon', () => {
  test('selecting a word updates the readable entry and its announced position', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'petrichor' }).click();

    await expect(page.getByRole('button', { name: 'petrichor' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(
      page.getByText('The earthy smell that rises when rain falls on dry ground.'),
    ).toBeVisible();
    await expect(page.getByText('2 of 8')).toBeVisible();
  });

  test('arrow navigation follows the lexicon order from the focused word', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'lucent' }).focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.getByRole('button', { name: 'petrichor' })).toBeFocused();
    await expect(
      page.getByText('The earthy smell that rises when rain falls on dry ground.'),
    ).toBeVisible();
  });

  test('dragging the browser selects the closest next word', async ({ page }) => {
    await page.goto('/');

    const browser = page.locator('.lex-track');
    await browser.dispatchEvent('pointerdown', { clientX: 300, pointerId: 1 });
    await browser.dispatchEvent('pointermove', { clientX: 200, pointerId: 1 });
    await browser.dispatchEvent('pointerup', { clientX: 200, pointerId: 1 });

    await expect(page.getByRole('button', { name: 'petrichor' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('the pause control gives the visitor control over autoplay', async ({ page }) => {
    await page.goto('/');

    const control = page.getByRole('button', { name: 'Pause the word browser' });
    await expect(control).toHaveAttribute('aria-pressed', 'false');

    await control.click();

    const playControl = page.getByRole('button', { name: 'Play the word browser' });
    await expect(playControl).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps the browser usable on a narrow touch viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const browser = page.locator('.lex-track');
    await expect(browser).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause the word browser' })).toBeVisible();
    expect(await browser.evaluate((track) => track.scrollWidth > track.clientWidth)).toBe(true);
  });
});
