import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const common = {
  managementUrl: 'https://corpus.example/early-access/manage#synthetic-token',
  postalAddress: 'Synthetic verification address',
};

let emails: Record<'confirmation' | 'launch', string>;
test.beforeAll(() => {
  emails = JSON.parse(
    execFileSync('bun', ['tests/helpers/render-email-fixtures.ts'], { encoding: 'utf8' }),
  ) as typeof emails;
});

for (const kind of ['confirmation', 'launch'] as const) {
  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${kind} matches reference structure and colors at ${width}px in ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme });
        // Deterministic fallback-font render: no external assets or provider requests.
        await page.route('https://**/*', (route) => route.abort());
        await page.setContent(await readFile(`docs/design/prototypes/email-${kind}.html`, 'utf8'));
        const reference = await page.evaluate(() => {
          const heading = document.querySelector('h1')!;
          const panel = document.querySelector('.panel')!;
          return {
            bodyColor: getComputedStyle(document.body).backgroundColor,
            headingColor: getComputedStyle(heading).color,
            headingFont: getComputedStyle(heading).fontFamily,
            headingSize: getComputedStyle(heading).fontSize,
            headingX: heading.getBoundingClientRect().x,
            panelColor: getComputedStyle(panel).backgroundColor,
          };
        });
        await page.screenshot({ path: testInfo.outputPath('reference.png'), fullPage: true });

        await page.setContent(emails[kind]);

        await expect(page.locator('body')).toHaveCSS('background-color', reference.bodyColor);
        await expect(page.locator('h1')).toHaveCSS('color', reference.headingColor);
        await expect(page.locator('h1')).toHaveCSS('font-family', reference.headingFont);
        await expect(page.locator('h1')).toHaveCSS('font-size', reference.headingSize);
        await expect(page.locator('.panel')).toHaveCSS('background-color', reference.panelColor);
        await expect(page.locator('.spine')).toHaveCount(2);
        await expect(page.locator('.masthead')).toHaveText('◆Corpus');
        expect((await page.locator('h1').boundingBox())!.x).toBe(reference.headingX);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await expect(page.getByRole('link', { name: 'Manage early access' })).toHaveAttribute(
          'href',
          common.managementUrl,
        );
        await page.screenshot({ path: testInfo.outputPath('implementation.png'), fullPage: true });
      });
    }
  }
}

test('retains the email structure and legible inline defaults when a client strips stylesheets', async ({
  page,
}) => {
  for (const email of Object.values(emails)) {
    const html = email.replace(/<style>[\s\S]*?<\/style>/g, '');
    await page.setContent(html);
    await page.locator('body').evaluate((body) => body.removeAttribute('style'));
    await expect(page.locator('body > table.bg')).toHaveCSS(
      'background-color',
      'rgb(241, 239, 233)',
    );
    await expect(page.locator('h1')).toHaveCSS('color', 'rgb(28, 26, 22)');
    await expect(page.locator('.panel')).toHaveCSS('background-color', 'rgb(251, 250, 246)');
    await expect(page.locator('.spine').first()).toHaveCSS('border-left-width', '1px');
    await expect(page.getByRole('link', { name: 'Manage early access' })).toBeVisible();
  }
});
