import { expect, test } from '@playwright/test';

test('mobile specimens stay paired with their stages across desktop resizing @mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // The prototype relocates each .state into its .stage below 880px. This app
  // renders a per-stage specimen instead and swaps the sticky column in above
  // that width — mechanics are the implementation's to choose (spec §13-14),
  // so assert the behaviour: every stage carries its own visible specimen,
  // ordered above the stage that follows it.
  const pairs = page.locator('.stage > .mobile-stage-visual');
  await expect(pairs).toHaveCount(3);
  for (const index of [0, 1, 2]) {
    await expect(
      page.locator(`.stage[data-stage="${index}"] > .mobile-stage-visual`),
    ).toBeVisible();
  }
  for (const index of [0, 1]) {
    const specimen = await page
      .locator(`.stage[data-stage="${index}"] > .mobile-stage-visual`)
      .boundingBox();
    const nextStage = await page.locator(`[data-stage="${index + 1}"]`).boundingBox();
    expect(specimen).not.toBeNull();
    expect(nextStage).not.toBeNull();
    expect((specimen?.y ?? 0) + (specimen?.height ?? 0)).toBeLessThanOrEqual(nextStage?.y ?? 0);
  }
  const reveal = page.getByRole('button', { name: 'Reveal the answer' });
  await reveal.click();
  await expect(reveal).toHaveText('lucent');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.sticky > .state')).toHaveCount(3);
  await expect(reveal).toHaveText('lucent');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(pairs).toHaveCount(3);
  await reveal.scrollIntoViewIfNeeded();
  await expect(reveal).toBeVisible();
  await expect(page.locator('.stage[data-stage="2"] > .mobile-stage-visual')).toBeVisible();
  await expect(reveal).toHaveText('lucent');
  await page.getByRole('button', { name: 'lucent', exact: true }).click();
  await expect(page.getByText('Solid — practised just now')).toBeVisible();
});

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
  await expect(page.locator('[data-progress-node]').nth(3)).toHaveAttribute('data-active', 'true');
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
  // The hero island reports readiness by flipping the document class, not with
  // a data attribute — see hero-motion.tsx. Assert the signal that exists.
  await expect(page.locator('html')).toHaveClass(/motion-enabled|motion-fallback/);
  await expect(page.locator('[data-motion-island="hero"]')).toBeVisible();
  await expect(page.locator('[data-hero="note"]')).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.fonts.ready);
  const underline = page.locator('.lex-underline');
  // Autoplay is gated on an IntersectionObserver at 0.35, so the browser only
  // runs once the reader has actually reached it — off-screen content should
  // not animate. Bring it into view before asserting playback.
  await page.locator('#lexicon').scrollIntoViewIfNeeded();
  await expect(underline).toHaveAttribute('data-running', 'true');
  await expect(underline.locator('i')).not.toHaveCSS('transform', 'matrix(0, 0, 0, 1, 0, 0)');
  await expect(page.getByRole('group', { name: /Word browser/ })).toHaveCount(1);
  await expect(page.locator('.encounter em')).toHaveText('a lucent morning');
  await page.getByRole('button', { name: 'Pause the word browser' }).dispatchEvent('click');
  await expect(underline).toHaveAttribute('data-running', 'false');
  // Pausing drops the running animation, so the fill returns to scaleX(0) —
  // the app expresses "no progress" with transform, not opacity.
  await expect(underline.locator('i')).toHaveCSS('transform', 'matrix(0, 0, 0, 1, 0, 0)');

  // The point of the test: advancing the browser must never move the document
  // under the reader.
  const settledScroll = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: 'Play the word browser' }).dispatchEvent('click');
  await expect(page.getByRole('button', { name: 'petrichor', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
    { timeout: 7_000 },
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(settledScroll);
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
