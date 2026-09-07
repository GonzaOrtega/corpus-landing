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
