import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

// Unique email per test run to avoid collisions
const ts = Date.now();
const userEmail = `user-${ts}@test.com`;
const adminEmail = `admin-${ts}@test.com`;
const password = 'testpass123';

/** Sign up via the /login page and wait for redirect to home. */
async function signUpViaLoginPage(page: any, name: string, email: string, pw: string) {
  await page.goto('/login');
  // Default mode is signin — switch to signup
  await page.locator('.auth-toggle').click();
  await expect(page.locator('.auth-form button')).toHaveText('Sign Up');
  const nameInput = page.locator('.auth-form input[data-bind="authName"]');
  const emailInput = page.locator('.auth-form input[data-bind="authEmail"]');
  const passInput = page.locator('.auth-form input[data-bind="authPassword"]');
  await nameInput.fill('');
  await nameInput.pressSequentially(name);
  await emailInput.fill('');
  await emailInput.pressSequentially(email);
  await passInput.fill('');
  await passInput.pressSequentially(pw);
  await page.locator('.auth-form button').click();
  // Wait for redirect to home page
  await page.waitForURL('/', { timeout: 5000 });
}

/** Sign in via the /login page and wait for redirect to home. */
async function signInViaLoginPage(page: any, email: string, pw: string) {
  await page.goto('/login');
  // Default mode is already signin
  const emailInput = page.locator('.auth-form input[data-bind="authEmail"]');
  const passInput = page.locator('.auth-form input[data-bind="authPassword"]');
  await emailInput.fill('');
  await emailInput.pressSequentially(email);
  await passInput.fill('');
  await passInput.pressSequentially(pw);
  await page.locator('.auth-form button').click();
  // Wait for redirect to home page
  await page.waitForURL('/', { timeout: 5000 });
}

// --- Auth Flow ---

test('auth: sign up shows user name in header', async ({ page }) => {
  await signUpViaLoginPage(page, 'TestUser', userEmail, password);

  // Should show signed-in state in header
  await expect(page.locator('.auth-user-name')).toContainText('TestUser', { timeout: 5000 });

  // Admin badge should NOT be visible for regular user
  const adminBadge = page.locator('.auth-user-name + span[data-show]');
  await expect(adminBadge).toBeHidden();

  // Tasks list should be visible
  await expect(page.locator('#task-list')).toBeVisible();

  // Admin panel should NOT be visible
  const adminPanel = page.locator('section').filter({ hasText: 'Admin Panel' });
  await expect(adminPanel).toBeHidden();
});

test('auth: sign out clears state', async ({ page }) => {
  await signUpViaLoginPage(page, 'SignOutTest', `signout-${ts}@test.com`, password);
  await expect(page.locator('.auth-user-name')).toContainText('SignOutTest', { timeout: 5000 });

  // Sign out via header button
  await page.getByRole('button', { name: 'Sign Out' }).click();

  // Should show sign-in link in header
  await expect(page.locator('header a[href="/login"]')).toBeVisible({ timeout: 5000 });

  // Sign-in prompt should be visible
  await expect(page.locator('a[href="/login"]').first()).toBeVisible();
});

test('auth: sign in after sign up works', async ({ page, request }) => {
  // Create user via API first
  const email = `signin-${ts}@test.com`;
  await request.post('/api/auth/sign-up/email', {
    data: { email, password, name: 'SignInTest' },
  });

  await signInViaLoginPage(page, email, password);
  await expect(page.locator('.auth-user-name')).toContainText('SignInTest', { timeout: 5000 });
});

// --- Tasks (requires auth) ---

test('tasks: create and display', async ({ page, request }) => {
  // Create user via API
  const email = `tasks-${ts}@test.com`;
  await request.post('/api/auth/sign-up/email', {
    data: { email, password, name: 'TaskUser' },
  });

  // Sign in via login page → redirected to home
  await signInViaLoginPage(page, email, password);
  await expect(page.locator('.auth-user-name')).toContainText('TaskUser', { timeout: 5000 });

  // Create a task
  const taskInput = page.locator('.task-form input[data-bind="taskTitle"]');
  await taskInput.pressSequentially('My Test Task');
  await page.locator('.task-form button').click();

  // Task should appear in list
  const taskList = page.locator('#task-list');
  await expect(taskList.locator('.task-item')).toHaveCount(1, { timeout: 5000 });
  await expect(taskList.locator('.task-title').first()).toHaveText('My Test Task');

  // Task count should show 1
  await expect(page.locator('#task-count-display')).toHaveText('1', { timeout: 5000 });
});

// --- Admin Panel ---

test('admin: promoted user sees admin panel', async ({ page, request }) => {
  // Create user via API
  await request.post('/api/auth/sign-up/email', {
    data: { email: adminEmail, password, name: 'AdminUser' },
  });

  // Promote to admin via direct D1 SQL
  execSync(
    `bunx wrangler d1 execute test-hono-db --local --command "UPDATE user SET role = 'admin' WHERE email = '${adminEmail}';"`,
    { cwd: process.cwd(), stdio: 'pipe' }
  );

  // Sign in via login page → redirected to home
  await signInViaLoginPage(page, adminEmail, password);
  await expect(page.locator('.auth-user-name')).toContainText('AdminUser', { timeout: 5000 });

  // Admin panel should be visible for admin role
  const adminPanel = page.locator('section').filter({ hasText: 'Admin Panel' });
  await expect(adminPanel).toBeVisible({ timeout: 5000 });

  // Admin badge should be visible
  await expect(page.locator('.auth-user-name + span[data-show]')).toBeVisible();
});

test('admin: unauthenticated user sees sign-in prompt', async ({ page }) => {
  await page.goto('/');

  // Sign-in link should be visible in header
  await expect(page.locator('header a[href="/login"]')).toBeVisible();

  // Sign-in prompt should be visible
  const prompt = page.locator('a[href="/login"]').first();
  await expect(prompt).toBeVisible();

  // Tasks section should be hidden
  await expect(page.locator('#task-list')).toBeHidden();

  // Admin panel should be hidden
  const adminPanel = page.locator('section').filter({ hasText: 'Admin Panel' });
  await expect(adminPanel).toBeHidden();
});
