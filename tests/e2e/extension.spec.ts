/**
 * Loads the unpacked extension (E2E build) in Chromium, tracks the static demo page, and pulls the
 * finished sessions from the dashboard origin over externally_connectable.
 */
import { test, expect, chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserLaunch } from '../../playwright.config';

const extDir = resolve('apps/extension/dist');

test('extension tracks an approved page and hands sessions to the dashboard', async () => {
  execFileSync(process.execPath, ['apps/extension/build.mjs'], {
    env: { ...process.env, SKILLTRACE_E2E: '1' },
    stdio: 'ignore',
  });
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'st-ext-')), {
    ...browserLaunch,
    headless: true,
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
    const extId = new URL(sw.url()).host;

    // Opt in and approve localhost:5310 through the extension's own message handler.
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: 'updateSettings',
        patch: { trackingEnabled: true },
      });
      const r = await chrome.runtime.sendMessage({
        type: 'addOrigin',
        origin: 'http://localhost:5310',
      });
      if (!r.ok) throw new Error(JSON.stringify(r));
    });

    // Not-approved behaviour: nothing is tracked on the dashboard itself (first-party marker).
    const page = await ctx.newPage();
    await page.goto('http://localhost:5310/lab/extension-demo.html');
    await page.waitForTimeout(2_000);
    await page.mouse.wheel(0, 600);
    await page.evaluate(async () => {
      const a = document.querySelector('audio')!;
      a.muted = true;
      await a.play();
    });
    await page.waitForTimeout(8_000);
    await page.evaluate(() => document.querySelector('audio')!.pause());
    await page.waitForTimeout(500);
    await page.close({ runBeforeUnload: true }); // pagehide -> closeSession

    const dash = await ctx.newPage();
    await dash.goto('http://localhost:5310/');
    await expect
      .poll(
        async () => {
          return dash.evaluate(
            (id) =>
              new Promise<number>((res) =>
                (globalThis as unknown as { chrome: typeof chrome }).chrome.runtime.sendMessage(
                  id,
                  { type: 'skilltrace.status' },
                  (r: { pendingSessions: number }) => res(r?.pendingSessions ?? -1),
                ),
              ),
            extId,
          );
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(1);

    const pulled = await dash.evaluate(
      (id) =>
        new Promise<
          {
            meta: { contentType: string; origin: string; url: string };
            events: { kind: string; type: string }[];
          }[]
        >((res) =>
          (globalThis as unknown as { chrome: typeof chrome }).chrome.runtime.sendMessage(
            id,
            { type: 'skilltrace.pull' },
            (r: { sessions: never[] }) => res(r.sessions),
          ),
        ),
      extId,
    );
    const types = pulled.map((s) => s.meta.contentType).sort();
    expect(types).toContain('audio');
    expect(types).toContain('reading');
    for (const s of pulled) {
      expect(s.meta.origin).toBe('http://localhost:5310');
      expect(s.meta.url).not.toContain('?'); // query strings are never stored
    }
    const audio = pulled.find((s) => s.meta.contentType === 'audio')!;
    expect(audio.events.some((e) => e.kind === 'media' && e.type === 'play')).toBe(true);
    expect(audio.events.some((e) => e.kind === 'media' && e.type === 'pause')).toBe(true);
  } finally {
    await ctx.close();
    // Restore the normal build (without the test-only host permission).
    execFileSync(process.execPath, ['apps/extension/build.mjs'], {
      env: { ...process.env, SKILLTRACE_E2E: '' },
      stdio: 'ignore',
    });
  }
});
