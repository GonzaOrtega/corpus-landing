import nextEnv from '@next/env';
import { defineConfig, devices } from '@playwright/test';

nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3018',
    trace: 'retain-on-failure',
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
  webServer: {
    command: 'bun run dev --port 3018',
    url: 'http://localhost:3018',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
