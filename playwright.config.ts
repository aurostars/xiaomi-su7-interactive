import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT ?? 4173);
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: e2eOrigin,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `corepack pnpm build && corepack pnpm exec vite preview --host 127.0.0.1 --port ${e2ePort}`,
    url: `${e2eOrigin}/xiaomi-su7-interactive/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
