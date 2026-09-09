import { expect, test } from '@playwright/test';

test.describe('Living Lexicon', () => {
  test('does not autoplay while the Lexicon is off-screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(5_500);
    await expect(page.getByRole('button', { name: 'lucent' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  });

  test('word selection scrolls only the horizontal track', async ({ page }) => {
    await page.goto('/#lexicon');
    await page.locator('#lexicon').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const before = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    await page.getByRole('button', { name: 'quotidian' }).click();
    const after = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'quotidian' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('autoplay ping-pongs through the whole Lexicon while visible', async ({ page }) => {
    await page.clock.install();
    await page.goto('/#lexicon');
    const browser = page.locator('.browser');
    await browser.evaluate((element) => element.scrollIntoView({ behavior: 'instant' }));
    // page.clock also controls requestAnimationFrame. Tick the mocked clock so
    // Chromium can deliver the IntersectionObserver update that starts autoplay.
    await page.clock.runFor(100);
    await expect(browser).toHaveAttribute('data-autoplay-running', 'true');
    for (let step = 0; step < 7; step += 1) {
      await page.clock.fastForward(5_100);
      await expect(page.locator(`.lex-item[data-lexicon-index="${step + 1}"]`)).toHaveAttribute(
        'aria-current',
        'true',
      );
    }
    await page.clock.fastForward(5_100);
    await page.clock.fastForward(5_100);
    await expect(page.getByRole('button', { name: 'quotidian' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('an interaction pause does not become an explicit pause', async ({ page }) => {
    await page.goto('/#lexicon');
    await page.getByRole('button', { name: 'petrichor' }).click();
    await expect(page.getByRole('button', { name: 'Pause the word browser' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('native horizontal scrolling selects the nearest entry', async ({ page }) => {
    await page.goto('/#lexicon');
    await page.locator('.lex-track').evaluate((track) => {
      const item = track.querySelector<HTMLElement>('[data-lexicon-index="5"]');
      if (!item) throw new Error('Missing target word');
      const inset = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
      track.scrollLeft = item.offsetLeft - inset;
      track.dispatchEvent(new Event('scroll'));
    });
    await expect(page.getByRole('button', { name: 'quotidian' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByText('Daily; ordinary to the point of going unnoticed.')).toBeVisible();
    await expect(page.getByText('6 of 8')).toBeVisible();
  });
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
    await control.focus();
    await control.click();

    const playControl = page.getByRole('button', { name: 'Play the word browser' });
    await expect(playControl).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps the browser usable on a narrow touch viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const browser = page.locator('.lex-track');
    await expect(browser).toBeVisible();
    const control = page.getByRole('button', { name: 'Pause the word browser' });
    await control.focus();
    await expect(control).toBeInViewport();
    expect(await browser.evaluate((track) => track.scrollWidth > track.clientWidth)).toBe(true);
  });
});
