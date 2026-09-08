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
  await expect(page.locator('#google-recaptcha-v3')).toHaveCount(0);
});
