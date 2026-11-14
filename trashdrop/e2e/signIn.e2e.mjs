// Signing in, in a real browser against the built app: the household's way
// in. Supabase is the fake in fakeSupabase.mjs; nothing reaches a real project.
import { test, expect } from '@playwright/test';
import { fakeSupabase, household, collectPageErrors } from './fakeSupabase.mjs';

const PASSWORD = 'correct-horse'; // the only password the fake accepts

// The install screen covers every browser visit until the app is installed
// (ForceInstallPrompt); the tests run as a household that installed it, and
// the first test checks the screen itself
test.beforeEach(async ({ page }, info) => {
  if (!info.title.startsWith('in a browser')) {
    await page.addInitScript(() => localStorage.setItem('trashdrop_app_installed', 'true'));
  }
});

async function openSignIn(page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
}

async function signIn(page, password) {
  await page.getByLabel('Email Address').fill('household@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('in a browser, the install screen comes first, and skipping it goes on to sign-in', async ({ page }) => {
  const errors = collectPageErrors(page);
  await fakeSupabase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Install TrashDrop' })).toBeVisible();
  // "Open App" on Android, "Maybe Later" elsewhere: use it in the browser this time
  await page.getByRole('button', { name: /^(Open App|Maybe Later)$/ }).click();
  await expect(page.getByRole('heading', { name: 'Install TrashDrop' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('signed out, every page leads to sign-in, which offers email and Google', async ({ page }) => {
  const errors = collectPageErrors(page);
  await fakeSupabase(page);
  await openSignIn(page);
  await expect(page.getByLabel('Email Address')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();

  for (const path of ['/dashboard', '/digital-bin', '/rewards']) {
    await page.goto(path);
    await expect(page, `${path} without signing in`).toHaveURL(/\/login$/);
  }
  expect(errors).toEqual([]);
});

test('a wrong password is refused, says so, and stays on sign-in', async ({ page }) => {
  const errors = collectPageErrors(page);
  const calls = await fakeSupabase(page, { account: household() });
  await openSignIn(page);
  await signIn(page, 'wrong-password');

  await expect(page.getByRole('alert')).toHaveText('Wrong email or password');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/login$/);
  expect(calls.some((c) => c.path === '/auth/v1/token')).toBe(true);
  expect(errors).toEqual([]);
});

test('the right password opens the dashboard: points, impact, recent activity and the bottom bar', async ({ page }) => {
  const errors = collectPageErrors(page);
  await fakeSupabase(page, { account: household() });
  await openSignIn(page);
  await signIn(page, PASSWORD);

  await expect(page).toHaveURL(/\/dashboard$/);
  // The phone's bottom bar (the top bar's links are hidden on a phone)
  for (const name of ['Dashboard', 'Scan QR', 'Request Pickup', 'Report']) {
    await expect(page.getByRole('link', { name, exact: true }).filter({ visible: true })).toHaveCount(1);
  }
  // A new household: no points yet, and nothing done
  await expect(page.getByRole('region', { name: 'Rewards' })).toContainText('0 points');
  await expect(page.getByRole('region', { name: 'Recent Activity' })).toContainText('No recent activities yet');
  await expect(page.getByRole('button', { name: 'Request Bin Pickup (No QR Bag)' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the session survives a reload: still on the dashboard, not sent to sign-in', async ({ page }) => {
  await fakeSupabase(page, { account: household() });
  await openSignIn(page);
  await signIn(page, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('region', { name: 'Rewards' })).toBeVisible();
});
