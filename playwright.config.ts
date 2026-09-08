import nextEnv from '@next/env';
import { defineConfig, devices } from '@playwright/test';

nextEnv.loadEnvConfig(process.cwd());

const previewBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = previewBaseUrl ?? 'http://localhost:3018';

// Preview deployments sit behind Vercel Authentication, which answers with a
// 200 login page rather than a 401 — assertions would fail somewhere far from
// the cause. Unset locally, where the run targets the webServer instead.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // Playwright defaults to a single worker under CI. Against 65 tests that was
  // the dominant cost, and retrying twice tripled every failure. maxFailures
  // and globalTimeout are the backstop: a broken suite reports in seconds
  // instead of grinding through the remainder.
  workers: process.env.CI ? 4 : undefined,
  retries: process.env.CI ? 1 : 0,
  maxFailures: process.env.CI ? 5 : 0,
  globalTimeout: process.env.CI ? 8 * 60_000 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...(bypassSecret
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': bypassSecret,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
  },
  projects: [
    // Chromium is the release gate. The remaining projects exercise the
    // representative, tagged journeys without multiplying DB-backed tests.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', grep: /@smoke/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', grep: /@smoke/, use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', grep: /@mobile/, use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', grep: /@mobile/, use: { ...devices['iPhone 13'] } },
  ],
  webServer: previewBaseUrl
    ? undefined
    : {
        // The production build, not the dev server: geometry and typography
        // assertions are calibrated against built CSS, and CI now runs this
        // path rather than a deployment.
        command: 'bun run build && bun run start -- --port 3018',
        // loadSiteConfig falls back to http://localhost:${PORT ?? 3000}, so
        // without this the app is canonical for a port nothing is serving. A
        // local .env hid that; CI has none.
        env: { PORT: '3018' },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // Covers the build, not just server boot.
        timeout: 240_000,
      },
});
