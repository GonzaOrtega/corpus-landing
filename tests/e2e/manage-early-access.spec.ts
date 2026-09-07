import { createHash, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';

const signupId = randomUUID();
const rawToken = `e2e-${randomUUID()}`;
const tokenHash = createHash('sha256').update(rawToken).digest('hex');
const email = `e2e-${signupId}@example.com`;
const maskedEmail = 'e***@example.com';

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for management E2E tests');
  return neon(url);
}

test.beforeAll(async () => {
  await database()`
    insert into early_access_signups
      (id, email_original, email_normalized, consent_version, consented_at, manage_token_hash)
    values
      (${signupId}, ${email}, ${email}, 'e2e', now(), ${tokenHash})
  `;
});

test.afterAll(async () => {
  await database()`delete from early_access_signups where id = ${signupId}`;
});

test('resolves a fragment token, masks PII, and unsubscribes only after the explicit action', async ({
  page,
}) => {
  await page.goto(`/early-access/manage#${rawToken}`);

  await expect(page).toHaveURL(/\/early-access\/manage$/);
  await expect(page.getByRole('heading', { name: 'Manage early access.' })).toBeVisible();
  await expect(page.getByText(maskedEmail)).toBeVisible();
  await expect(page.getByText(email)).toHaveCount(0);

  await page.getByRole('button', { name: 'Unsubscribe' }).click();
  await expect(page.getByRole('heading', { name: "You're off the list." })).toBeVisible();

  await page.goto(`/early-access/manage#${rawToken}`);
  await expect(page.getByRole('heading', { name: "You're off the list." })).toBeVisible();
});
