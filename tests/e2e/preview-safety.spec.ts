import { expect, test } from '@playwright/test';

test('non-production deployments disallow indexing and do not load real CAPTCHA', async ({
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
  await expect(page.locator('#google-recaptcha-v3')).toHaveCount(0);
});
