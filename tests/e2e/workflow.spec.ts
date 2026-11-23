/**
 * Complete learning-to-passport workflow in Local demo mode:
 * onboarding -> video lesson with rewind -> skill correction -> assessment -> GitHub import
 * (GitHub API mocked) -> project confirmation -> manual work session -> publish passport -> public view.
 * Also asserts the core business rules: importing a repo adds no learning or project time.
 */
import { test, expect, type Page } from '@playwright/test';

async function onboard(page: Page) {
  await page.goto('/signin');
  await page.getByRole('button', { name: /Local demo mode/ }).click();
  await expect(page).toHaveURL(/onboarding/);
  const next = page.getByRole('button', { name: 'Continue' });
  await next.click();
  await next.click();
  await page.getByRole('switch', { name: 'Enable learning activity tracking' }).click();
  await next.click();
  await next.click();
  await next.click();
  await page.getByRole('button', { name: 'Open the Learning Lab' }).click();
  await expect(page).toHaveURL(/\/app\/lab$/);
}

const statValue = async (page: Page, label: string) =>
  (await page.locator('dt', { hasText: label }).first().locator('xpath=following-sibling::dd[1]').innerText()).trim();

function mockGithub(page: Page) {
  const repo = {
    full_name: 'demo-user/grades-api',
    name: 'grades-api',
    description: 'Student grades REST API',
    html_url: 'https://github.com/demo-user/grades-api',
    topics: ['fastapi'],
    created_at: '2026-10-01T10:00:00Z',
    pushed_at: '2026-11-20T10:00:00Z',
    fork: false,
    private: false,
  };
  return page.route('https://api.github.com/**', (route) => {
    const url = route.request().url();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.endsWith('/repos/demo-user/grades-api')) return json(repo);
    if (url.endsWith('/languages')) return json({ Python: 12000, Dockerfile: 300 });
    if (url.endsWith('/readme')) return json({ content: btoa('# Grades API\nBuilt with FastAPI and SQLite. REST API endpoints.') });
    if (url.includes('/commits')) return json([{ sha: 'abc1234def', html_url: `${repo.html_url}/commit/abc1234`, commit: { message: 'Add grades endpoint', author: { date: '2026-11-19T10:00:00Z' } } }]);
    return route.fulfill({ status: 404, body: '{}' });
  });
}

test('learner goes from study to a published, evidence-backed passport', async ({ page }) => {
  await onboard(page);

  // 1. Video lesson: play, rewind, play again.
  await page.goto('/app/lab/video');
  await expect(page.getByRole('button', { name: 'Finish session' })).toBeEnabled();
  await page.evaluate(async () => {
    const v = document.querySelector('video')!;
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 6000));
    v.currentTime = Math.max(0, v.currentTime - 4);
    await new Promise((r) => setTimeout(r, 5000));
    v.pause();
    await new Promise((r) => setTimeout(r, 1200));
  });
  const active = await statValue(page, 'Eligible active time');
  const revision = await statValue(page, 'Revision time');
  expect(parseInt(active)).toBeGreaterThanOrEqual(9);
  expect(parseInt(revision)).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();

  // 2. AI is not configured in this build: the session is queued, never auto-labelled. Correct it.
  await page.goto('/app/sessions');
  await expect(page.getByText('Queued (AI unavailable)')).toBeVisible();
  await page.getByRole('button', { name: 'Correct skills' }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill('Python 3');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Corrected by you')).toBeVisible();

  // 3. Assessment with deterministic grading.
  await page.goto('/app/assessments');
  await page.getByRole('button', { name: 'Start' }).first().click();
  for (const [q, answer] of [
    ['py1', '10'],
    ['py2', '8 then None'],
    ['py3', '5'],
    ['py4', 'Line 1: missing colon after the parameter list'],
    ['py5', '1'],
  ]) {
    await page.locator(`input[name="${q}"]`).locator('xpath=..').filter({ hasText: new RegExp(`^${answer.replace(/[()]/g, '\\$&')}$`) }).locator('input').check();
  }
  await page.getByRole('button', { name: 'Submit for grading' }).click();
  await expect(page.getByText('Score: 5/5')).toBeVisible();

  // Learning hours before importing a project.
  await page.goto('/app');
  const learningBefore = await page.locator('text=Eligible learning (all time)').locator('xpath=following-sibling::div[1]').innerText();

  // 4. GitHub import (mocked public API) -> suggested project -> confirm.
  await mockGithub(page);
  await page.goto('/app/github');
  await page.getByLabel('Repository URL').fill('https://github.com/demo-user/grades-api');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText(/Imported demo-user\/grades-api/)).toBeVisible();
  await page.goto('/app');
  await expect(page.getByText('New relevant project detected')).toBeVisible();
  await expect(page.locator('text=Eligible learning (all time)').locator('xpath=following-sibling::div[1]')).toHaveText(learningBefore);
  await expect(page.locator('text=Project work').locator('xpath=following-sibling::div[1]')).toHaveText('0.0 h');

  await page.goto('/app/projects');
  await page.getByRole('button', { name: 'Review' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Python')).toBeVisible();
  await expect(dialog.getByText('FastAPI')).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm project' }).click();
  await page.getByRole('link', { name: 'grades-api' }).click();
  await expect(page.getByText('0 h (milestone)').first()).toBeVisible();

  // 5. Manual project work: only project time changes.
  await page.getByLabel('Start').fill('2026-11-21T09:00');
  await page.getByLabel('End').fill('2026-11-21T11:00');
  await page.getByLabel('Description').fill('Backend endpoints');
  await page.getByRole('button', { name: 'Add session' }).click();
  await expect(page.getByText('2.0 h')).toBeVisible();
  await page.goto('/app');
  await expect(page.locator('text=Project work').locator('xpath=following-sibling::div[1]')).toHaveText('2.0 h');
  await expect(page.locator('text=Eligible learning (all time)').locator('xpath=following-sibling::div[1]')).toHaveText(learningBefore);

  // 6. Passport: choose what is public, publish, open the recruiter view.
  await page.goto('/app/passport');
  await page.getByLabel('Display name').fill('Demo Learner');
  await page.getByLabel('Professional headline').fill('Aspiring backend engineer');
  await page.locator('label', { hasText: 'Python' }).locator('input[type=checkbox]').check();
  await page.locator('label', { hasText: 'grades-api' }).locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Publish passport' }).click();
  const link = await page.locator('a[href*="/p/"]').first().getAttribute('href');
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'Demo Learner' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Python' })).toBeVisible();
  await expect(page.getByText('Automatically recorded activity').first()).toBeVisible();
  await expect(page.getByText('Assessment result').first()).toBeVisible();
  await expect(page.getByText(/Self-reported work: 2 h/)).toBeVisible();
  await expect(page.getByText('How to read this passport')).toBeVisible();
  // Private details are not published by default.
  await expect(page.getByText('Learning since')).toHaveCount(0);

  // 7. Revoke: the public link stops working.
  await page.goto('/app/passport');
  await page.getByRole('button', { name: 'Revoke public link' }).click();
  await page.goto(link!);
  await expect(page.getByText(/does not exist or its owner revoked/)).toBeVisible();
});
