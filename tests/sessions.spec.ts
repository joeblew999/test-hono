import { test, expect } from '@playwright/test';
import { API, SEL } from '../constants';
import { signInViaLoginPage } from './fixtures';

const ts = Date.now();
const password = 'testpass123';

// --- Sessions ---

test('sessions: authenticated user sees session list', async ({ page, request }) => {
  const email = `sess-list-${ts}@test.com`;
  await request.post(API.AUTH_SIGNUP, {
    data: { email, password, name: 'SessionUser' },
  });

  await signInViaLoginPage(page, email, password);
  await expect(page.locator('.auth-user-name')).toContainText('SessionUser', { timeout: 5000 });

  // Session list should load with at least 1 session (current)
  const sessionList = page.locator(SEL.SESSION_LIST);
  await expect(sessionList.locator('.session-item')).toHaveCount(1, { timeout: 10000 });

  // Current session should show "This device" badge
  await expect(sessionList).toContainText('This device');
});

test('sessions: unauthenticated user does not see sessions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(SEL.SESSION_LIST)).toBeHidden();
});

test('sessions: JSON API returns session info', async ({ request }) => {
  const email = `sess-api-${ts}@test.com`;
  // Sign up — this creates a session and sets cookies on the request fixture
  const signupRes = await request.post(API.AUTH_SIGNUP, {
    data: { email, password, name: 'APISessionUser' },
  });
  expect(signupRes.ok()).toBeTruthy();

  // List sessions via JSON API (using the session from sign-up)
  const res = await request.get(API.SESSIONS);
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.sessions).toBeDefined();
  expect(data.sessionCount).toBeGreaterThanOrEqual(1);

  // Each session should have parsed browser/OS
  const session = data.sessions[0];
  expect(session.browser).toBeDefined();
  expect(session.os).toBeDefined();
  expect(session.isCurrent).toBeDefined();
  expect(session.token).toBeDefined();
});

test('sessions: revoke session via API', async ({ request }) => {
  const email = `sess-revoke-${ts}@test.com`;
  // Sign up — creates session #1
  const signupRes = await request.post(API.AUTH_SIGNUP, {
    data: { email, password, name: 'RevokeUser' },
  });
  expect(signupRes.ok()).toBeTruthy();

  // List sessions — should have at least 1
  const listRes = await request.get(API.SESSIONS);
  expect(listRes.ok()).toBeTruthy();
  const listData = await listRes.json();
  expect(listData.sessionCount).toBeGreaterThanOrEqual(1);

  // Attempt to find a non-current session to revoke
  const other = listData.sessions.find((s: any) => !s.isCurrent);
  if (other) {
    const revokeRes = await request.post(API.SESSIONS_REVOKE, {
      data: { revokeSessionToken: other.token },
    });
    expect(revokeRes.ok()).toBeTruthy();

    // Re-list — should have fewer sessions
    const afterRes = await request.get(API.SESSIONS);
    const afterData = await afterRes.json();
    expect(afterData.sessionCount).toBeLessThan(listData.sessionCount);
  }
});
