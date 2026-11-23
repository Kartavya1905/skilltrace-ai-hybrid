import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * E2E tests run against the Vite dev server in Local demo mode (no Firebase needed).
 * Browser: PW_CHROMIUM_PATH, else a cached Playwright Chromium, else Playwright's default.
 * (Google Chrome builds no longer allow --load-extension, so the extension test needs Chromium.)
 */
const cached = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe');
export const chromiumPath = process.env.PW_CHROMIUM_PATH ?? (existsSync(cached) ? cached : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5310',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  webServer: {
    command: 'node apps/web/node_modules/vite/bin/vite.js apps/web --port 5310 --strictPort',
    url: 'http://localhost:5310',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
