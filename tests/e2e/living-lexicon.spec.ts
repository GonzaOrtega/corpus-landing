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

test.describe('Living Lexicon without element scrollTo', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const nativeScrollTo = Element.prototype.scrollTo;
      Object.defineProperty(Element.prototype, 'scrollTo', {
        configurable: true,
        get() {
          return this.classList.contains('lex-track') ? undefined : nativeScrollTo;
        },
      });
    });
  });

  test('selection and manual scrolling stay usable @smoke @mobile', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#lexicon');
    const track = page.locator('.lex-track');
    await expect(page.locator('.lex-pause')).toBeHidden();
    await expect(page.locator('.browser')).toHaveAttribute('data-autoplay-running', 'false');
    await expect(page.getByRole('button', { name: 'lucent', exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const before = await page.evaluate(() => window.scrollY);

    // DOM click avoids Playwright scrolling the document to expose an off-screen word.
    await page
      .getByRole('button', { name: 'quotidian', exact: true })
      .evaluate((word) => (word as HTMLButtonElement).click());
    await expect(page.getByText('6 of 8')).toBeVisible();
    await expect
      .poll(() =>
        track.evaluate((element) => {
          const word = element.querySelector<HTMLElement>('[data-lexicon-index="5"]');
          if (!word) throw new Error('Missing selected word');
          const target = word.offsetLeft - Number.parseFloat(getComputedStyle(element).paddingLeft);
          return Math.abs(element.scrollLeft - target);
        }),
      )
      .toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);

    await page.getByRole('button', { name: 'quotidian', exact: true }).focus();
    const beforeKeyboard = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('7 of 8')).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(beforeKeyboard);

    await track.evaluate((element) => {
      const word = element.querySelector<HTMLElement>('[data-lexicon-index="1"]');
      if (!word) throw new Error('Missing target word');
      element.scrollLeft =
        word.offsetLeft - Number.parseFloat(getComputedStyle(element).paddingLeft);
    });
    await expect(page.getByText('2 of 8')).toBeVisible();
    await expect(page.getByRole('button', { name: 'petrichor', exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(errors).toEqual([]);
  });

  test('autoplay and drag completion work with the fallback @smoke @mobile', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install();
    await page.goto('/#lexicon');
    await page
      .locator('.browser')
      .evaluate((element) => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
    await page.clock.runFor(100);
    await expect(page.locator('.browser')).toHaveAttribute('data-autoplay-running', 'true');
    const before = await page.evaluate(() => window.scrollY);
    await page.clock.fastForward(5_100);
    await expect(page.getByText('2 of 8')).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);

    // Real pointer events exercise capture and the drag-completion scroll path.
    const track = page.locator('.lex-track');
    const distance = await track.evaluate((element) => {
      const word = element.querySelector<HTMLElement>('[data-lexicon-index="2"]');
      if (!word) throw new Error('Missing next word');
      return (
        word.offsetLeft -
        Number.parseFloat(getComputedStyle(element).paddingLeft) -
        element.scrollLeft
      );
    });
    const bounds = await track.boundingBox();
    if (!bounds) throw new Error('Missing lexicon track');
    const x = bounds.x + Math.min(bounds.width / 2, 250);
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - distance, y, { steps: 5 });
    await page.clock.runFor(100);
    await page.mouse.up();
    await page.clock.runFor(100);
    await expect(track).not.toHaveAttribute('data-dragging', 'true');
    await expect(page.getByText('3 of 8')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
