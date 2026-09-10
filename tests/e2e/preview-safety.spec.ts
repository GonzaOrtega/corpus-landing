import { expect, test } from '@playwright/test';

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
