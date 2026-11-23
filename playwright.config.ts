import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * E2E tests run against the Vite dev server in Local demo mode (no Firebase needed).
 * Browser: PW_CHROMIUM_PATH, else a cached Playwright Chromium (Windows dev machine), else
 * Playwright's own Chromium (CI: `playwright install chromium`).
 * Google Chrome builds no longer allow --load-extension, and the headless shell cannot load
 * extensions, so the extension test uses the full `chromium` channel when no path is given.
 */
const isCI = !!process.env.CI;
const cached = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe');
export const chromiumPath =
  process.env.PW_CHROMIUM_PATH ?? (existsSync(cached) ? cached : undefined);
export const browserLaunch = chromiumPath
  ? { executablePath: chromiumPath }
  : { channel: 'chromium' as const };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5310',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
    trace: isCI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: 'node apps/web/node_modules/vite/bin/vite.js apps/web --port 5310 --strictPort',
    url: 'http://localhost:5310',
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
