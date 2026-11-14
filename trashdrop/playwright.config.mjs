// Browser tests (e2e/): the built app in Chromium against a fake Supabase
// (e2e/fakeSupabase.mjs), run in CI on every pull request. Build first with
// the placeholder Supabase settings, then:
//   REACT_APP_SUPABASE_URL=https://ci-placeholder.supabase.co \
//   REACT_APP_SUPABASE_ANON_KEY=sb_publishable_ci_placeholder npm run build
//   npm run test:browser
// PLAYWRIGHT_CHROMIUM lets a machine with its own Chromium use it.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.mjs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block', // the PWA worker would answer from its cache, around the fake
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  // Households use phones: a mid-range Android screen
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
