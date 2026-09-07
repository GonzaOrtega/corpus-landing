import { expect, test } from '@playwright/test';

test('document scrolling drives the sticky header, progress rail, and philosophy theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('[data-hero="note"]')).toHaveCSS('opacity', '1');
  await expect(page.locator('.site-header')).toHaveAttribute('data-stuck', 'false');
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await expect(page.locator('.site-header')).toHaveAttribute('data-stuck', 'true');
  const scroll = await page.evaluate(() => ({
    window: window.scrollY,
    body: document.body.scrollTop,
    owner: document.scrollingElement?.tagName,
  }));
  expect(scroll).toEqual({ window: 600, body: 0, owner: 'HTML' });
  await expect(page.locator('.progress-fill')).not.toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 0, 0, 0)',
  );
  await page.locator('[data-stage="1"]').evaluate((stage) => {
    window.scrollTo({
      top: window.scrollY + stage.getBoundingClientRect().top - 200,
      behavior: 'instant',
    });
  });
  await expect(page.locator('[data-stage="1"] h3')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-state="1"]')).toHaveCSS('opacity', '1');
  await page.locator('#philosophy').evaluate((section) => {
    window.scrollTo({
      top: window.scrollY + section.getBoundingClientRect().top,
      behavior: 'instant',
    });
  });
  await expect(page.locator('body')).toHaveClass(/theme-night/);
  await expect(page.locator('.progress-node').nth(3)).toHaveAttribute('data-on', 'true');
  await expect(page.locator('.site-header')).toHaveCSS('color', 'rgb(231, 228, 221)');
  await page.locator('#early-access').evaluate((section) => {
    window.scrollTo({
      top: window.scrollY + section.getBoundingClientRect().top,
      behavior: 'instant',
    });
  });
  await expect(page.locator('body')).not.toHaveClass(/theme-night/);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`prototype column geometry at ${viewport.width}px @mobile`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const heading = await page.locator('h1').boundingBox();
    expect(heading).not.toBeNull();
    expect(heading?.x).toBeCloseTo(viewport.width === 390 ? 44 : 270, 0);
    for (const section of ['#how', '#lexicon', '#philosophy', '#early-access']) {
      const box = await page.locator(`${section} h2`).boundingBox();
      expect(box?.x).toBeCloseTo(heading?.x ?? 0, 0);
    }
    if (viewport.width === 1440) {
      expect(heading?.height).toBeGreaterThan(270);
      expect(heading?.height).toBeLessThan(295);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.locator('.site-header .button')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator('.hero .button-solid')).toHaveCSS(
      'background-color',
      'rgb(176, 80, 58)',
    );
  });
}

test('lexicon progress follows playback and preserves the document position', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-motion-island="hero"]')).toHaveAttribute(
    'data-motion-ready',
    'true',
  );
  await expect(page.locator('[data-hero="note"]')).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.fonts.ready);
  const underline = page.locator('.lex-underline');
  await expect(underline).toHaveAttribute('data-running', 'true');
  await expect(underline.locator('i')).not.toHaveCSS('transform', 'matrix(0, 0, 0, 1, 0, 0)');
  await expect(page.getByRole('group', { name: /Word browser/ })).toHaveCount(1);
  await expect(page.locator('.encounter em')).toHaveText('a lucent morning');
  await page.getByRole('button', { name: 'Pause the word browser' }).dispatchEvent('click');
  await expect(underline).toHaveAttribute('data-running', 'false');
  await expect(underline.locator('i')).toHaveCSS('opacity', '0');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.getByRole('button', { name: 'Play the word browser' }).dispatchEvent('click');
  await expect(page.getByRole('button', { name: 'petrichor', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
    { timeout: 7_000 },
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('reduced motion keeps the theme readable and the lexicon progress stopped', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.lex-underline')).toHaveAttribute('data-running', 'false');
  await page.locator('#philosophy').evaluate((section) => section.scrollIntoView());
  await expect(page.locator('body')).toHaveClass(/theme-night/);
  await expect(page.locator('body')).toHaveCSS('transition-duration', '0s');
});
