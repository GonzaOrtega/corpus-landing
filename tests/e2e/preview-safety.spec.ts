import { expect, test } from '@playwright/test';

function headerTokens(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

// @preview: this asserts what the deployed artifact serves, so it runs against
// the real preview URL in the preview-smoke job rather than the local build.
test('@preview non-production deployments disallow indexing and do not load real CAPTCHA', async ({
  page,
}) => {
  test.skip(
    process.env.VERCEL_ENV === 'production',
    'Production has intentionally different discovery rules.',
  );

  const robots = await page.request.get('/robots.txt');
  await expect(robots).toBeOK();
  expect(await robots.text()).toContain('Disallow: /');

  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  // The id must match recaptcha-bridge.tsx's `scriptId`. It previously read
  // `#google-recaptcha-v3`, a name the bridge has never used, so the assertion
  // could not fail and spec §28's "no real CAPTCHA in preview" went unproven.
  await expect(page.locator('#google-recaptcha-enterprise')).toHaveCount(0);
  // Independent of the element id: no request may reach Google's script host.
  await expect(page.locator('script[src*="recaptcha"]')).toHaveCount(0);
});

test('@preview deployed HTML varies cache entries by Accept', async ({ request }) => {
  const response = await request.get('/', {
    headers: { accept: 'text/html, text/markdown;q=0.2' },
  });

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  expect(headerTokens(response.headers().vary)).toContain('accept');
  expect(response.headers().link ?? '').toContain(
    '</index.md>; rel="alternate"; type="text/markdown"',
  );
});
