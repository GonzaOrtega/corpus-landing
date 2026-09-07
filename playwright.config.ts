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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run dev --port 3018',
    url: 'http://localhost:3018',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
