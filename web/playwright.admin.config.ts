import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-admin',
  outputDir: './test-results-admin',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:3101', ...devices['Desktop Chrome'], channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm --prefix ../admin-dashboard run dev -- --hostname 127.0.0.1 --port 3101',
    url: 'http://127.0.0.1:3101/login',
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-admin-test' },
  },
});
