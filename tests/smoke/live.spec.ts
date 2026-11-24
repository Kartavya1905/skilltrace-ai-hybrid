/**
 * Post-deploy smoke tests against the live site. Read-only: no sign-in, no writes.
 * They check that the real build boots, routes and security headers are right, Firestore answers
 * through the security rules, and App Check issues tokens on the production domain.
 */
import { expect, test, type Page } from '@playwright/test';

const url = process.env.SMOKE_URL;
test.skip(!url, 'Set SMOKE_URL to the deployed origin');

/**
 * Uncaught exceptions in the app, plus console errors logged by SkillTrace's own origin.
 * Third-party frames (Google's reCAPTCHA iframe) log browser-policy notices such as
 * "requestStorageAccess: Permission denied" or report-only CSP warnings; those are not app errors.
 */
function collectErrors(page: Page) {
  const errors: string[] = [];
  const own = new URL(url!).origin;
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const from = m.location().url;
    if (from && !from.startsWith(own)) return;
    const text = m.text();
    if (/report-only Content Security Policy|requestStorageAccess/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

test('landing page boots the production build without errors', async ({ page }) => {
  const errors = collectErrors(page);
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  expect(res?.headers()['x-frame-options']).toBe('DENY');
  expect(res?.headers()['x-content-type-options']).toBe('nosniff');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.getByText('SkillTrace').first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('sign-in offers Google, email and Local demo mode (Firebase is configured)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/signin');
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Local demo mode/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('protected routes redirect signed-out visitors to sign-in', async ({ page }) => {
  await page.goto('/app/lab/video');
  await expect(page).toHaveURL(/\/signin/);
});

test('Firestore answers through the rules: an unknown passport link shows the revoked message', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/p/does-not-exist-smoke');
  await expect(page.getByText(/does not exist or its owner revoked/)).toBeVisible({
    timeout: 20_000,
  });
  // A denied read for a missing passport is the expected rules outcome; no other errors.
  expect(errors.filter((e) => !/permission|insufficient|403/i.test(e))).toEqual([]);
});

test('App Check issues a token on the production domain (reCAPTCHA Enterprise)', async ({
  page,
}) => {
  const appId = process.env.SMOKE_APP_ID;
  const apiKey = process.env.SMOKE_API_KEY;
  const project = new URL(url!).hostname.split('.')[0];
  test.skip(!appId || !apiKey, 'Set SMOKE_APP_ID and SMOKE_API_KEY');
  await page.goto('/signin');
  await page.waitForFunction(
    () => !!(globalThis as { grecaptcha?: { enterprise?: unknown } }).grecaptcha?.enterprise,
    undefined,
    { timeout: 20_000 },
  );
  const result = await page.evaluate(
    async ({ appId, apiKey, project }) => {
      const g = (
        globalThis as unknown as {
          grecaptcha: {
            enterprise: {
              ready(cb: () => void): void;
              execute(widget: number, o: { action: string }): Promise<string>;
            };
          };
        }
      ).grecaptcha.enterprise;
      await new Promise<void>((r) => g.ready(r));
      // Widget 0 is the invisible widget Firebase App Check rendered.
      const token = await g.execute(0, { action: 'fire_app_check' });
      const r = await fetch(
        `https://content-firebaseappcheck.googleapis.com/v1/projects/${project}/apps/${appId}:exchangeRecaptchaEnterpriseToken?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ recaptcha_enterprise_token: token }),
        },
      );
      const body = (await r.json()) as { token?: string; error?: { message?: string } };
      return { status: r.status, hasToken: !!body.token, error: body.error?.message ?? null };
    },
    { appId: appId!, apiKey: apiKey!, project: project! },
  );
  expect(result).toEqual({ status: 200, hasToken: true, error: null });
});
