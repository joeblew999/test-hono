import { test, expect } from '@playwright/test';
import { API, SEL } from '../constants';
import { signUpViaLoginPage, signInViaLoginPage } from './fixtures';

// --- Notes CRUD (requires auth) ---

const ts = Date.now();
const password = 'testpass123';

test.describe('notes', () => {
  const noteEmail = `notes-${ts}@test.com`;
  let signedUp = false;

  test.beforeEach(async ({ page }) => {
    // Sign up once, sign in for subsequent tests
    if (!signedUp) {
      await signUpViaLoginPage(page, 'NoteUser', noteEmail, password);
      signedUp = true;
    } else {
      await signInViaLoginPage(page, noteEmail, password);
    }
    // Reset notes for test isolation (must use page context for auth cookies)
    await page.evaluate((url) => fetch(url, { method: 'POST' }), API.NOTES_RESET);
  });

  test('notes: add and display', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.auth-user-name')).toContainText('NoteUser', { timeout: 5000 });

    const notesList = page.locator(SEL.NOTES_LIST);
    await expect(notesList).toContainText('No notes yet', { timeout: 5000 });

    const input = page.locator('.notes-form input[type="text"]');
    await input.pressSequentially('Buy groceries');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(notesList.locator('.note-item')).toHaveCount(1, { timeout: 5000 });
    await expect(notesList.locator('.note-text').first()).toHaveText('Buy groceries');
    await expect(page.locator('[data-text="$noteCount"]').first()).toHaveText('1');
  });

  test('notes: add multiple and delete', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.auth-user-name')).toContainText('NoteUser', { timeout: 5000 });

    const notesList = page.locator(SEL.NOTES_LIST);
    await expect(notesList).toContainText('No notes yet', { timeout: 5000 });

    const input = page.locator('.notes-form input[type="text"]');
    const addBtn = page.getByRole('button', { name: 'Add', exact: true });

    await input.pressSequentially('First note');
    await addBtn.click();
    await expect(notesList.locator('.note-item')).toHaveCount(1, { timeout: 5000 });

    await input.pressSequentially('Second note');
    await addBtn.click();
    await expect(notesList.locator('.note-item')).toHaveCount(2, { timeout: 5000 });

    const secondNote = notesList.locator('.note-item', { hasText: 'Second note' });
    await secondNote.locator('.note-delete').click();

    await expect(notesList.locator('.note-item')).toHaveCount(1, { timeout: 5000 });
    await expect(notesList.locator('.note-text').first()).toHaveText('First note');
  });

  test('notes: input clears after add', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.auth-user-name')).toContainText('NoteUser', { timeout: 5000 });

    const input = page.locator('.notes-form input[type="text"]');
    await input.pressSequentially('Test note');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(input).toHaveValue('', { timeout: 5000 });
  });
});

// --- Interval Timer (no auth needed) ---

test('interval: timer ticks', async ({ page }) => {
  await page.goto('/');

  const elapsed = page.locator('[data-text="$elapsed"]');
  await expect(async () => {
    const value = await elapsed.textContent();
    expect(Number(value)).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 5000 });
});

// --- Reactive Styles (no auth needed) ---

test('reactive styles: bar width changes with counter', async ({ request, page }) => {
  await request.post(API.COUNTER_RESET);
  await page.goto('/');

  const bar = page.locator('.bar-fill');
  await expect(bar).toHaveText('0%', { timeout: 5000 });

  const incBtn = page.getByRole('button', { name: 'Increment' });
  await incBtn.click();
  await incBtn.click();
  await incBtn.click();
  await expect(bar).toHaveText('30%', { timeout: 5000 });
});

// --- Signal Inspector (no auth needed) ---

test('signal inspector: shows JSON with signal names', async ({ page }) => {
  await page.goto('/');

  const inspector = page.locator('[data-json-signals]');
  await expect(inspector).toContainText('count');
  await expect(inspector).toContainText('inputValue');
});
