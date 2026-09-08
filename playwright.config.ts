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
  retries: process.env.CI ? 2 : 0,
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
        command: 'bun run dev --port 3018',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
