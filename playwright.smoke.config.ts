import { defineConfig } from '@playwright/test';
import { browserLaunch } from './playwright.config';

/**
 * M5: post-deploy smoke tests against the LIVE site (no dev server, no writes, no sign-in).
 * SMOKE_URL is the deployed origin; SMOKE_APP_ID / SMOKE_API_KEY are the public web config
 * used to prove App Check works on the real domain.
 *   SMOKE_URL=https://<project>.web.app pnpm test:smoke
 */
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: process.env.SMOKE_URL,
    launchOptions: 'executablePath' in browserLaunch ? browserLaunch : {},
  },
});
