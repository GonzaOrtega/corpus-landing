import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const criticalImpacts = new Set(['serious', 'critical']);

async function expectNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) =>
    criticalImpacts.has(violation.impact ?? ''),
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test.describe('static accessibility', () => {
  // Scan the complete static representation. Normal-motion content intentionally
  // fades in, so scanning it mid-animation produces a timing-dependent contrast
  // result rather than an accessibility finding in the rendered destination.
  test.use({ reducedMotion: 'reduce' });

  for (const [path, name] of [
    ['/', 'homepage'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
  ] as const) {
    test(`has no serious or critical axe violations on ${name}`, async ({ page }) => {
      await page.goto(path);
      await expectNoSeriousAxeViolations(page);
    });
  }
});

test('moving Lexicon content exposes an accurate keyboard pause control', async ({ page }) => {
  await page.goto('/#lexicon');
  const control = page.getByRole('button', { name: 'Pause the word browser' });
  await expect(control).not.toBeInViewport();
  await control.focus();
  await expect(control).toBeInViewport();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'petrichor' }).click();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.lex-detail')).toHaveAttribute('aria-live', 'polite');
});
