import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/notes/reset');
});

// --- Notes CRUD ---

test('notes: add and display', async ({ page }) => {
  await page.goto('/');

  const notesList = page.locator('#notes-list');

  // Wait for data-init to fire and load the empty list
  await expect(notesList).toContainText('No notes yet', { timeout: 5000 });

  // Add a note — pressSequentially triggers Datastar data-bind
  const input = page.locator('.notes-form input[type="text"]');
  await input.pressSequentially('Buy groceries');
  await page.getByRole('button', { name: 'Add' }).click();

  // Note should appear in the list
  await expect(notesList.locator('.note-item')).toHaveCount(1, { timeout: 5000 });
  await expect(notesList.locator('.note-text').first()).toHaveText('Buy groceries');

  // Note count updates
  await expect(page.locator('[data-text="$noteCount"]').first()).toHaveText('1');
});

test('notes: add multiple and delete', async ({ page }) => {
  await page.goto('/');

  const notesList = page.locator('#notes-list');
  await expect(notesList).toContainText('No notes yet', { timeout: 5000 });

  const input = page.locator('.notes-form input[type="text"]');
  const addBtn = page.getByRole('button', { name: 'Add' });

  // Add two notes
  await input.pressSequentially('First note');
  await addBtn.click();
  await expect(notesList.locator('.note-item')).toHaveCount(1, { timeout: 5000 });

  await input.pressSequentially('Second note');
  await addBtn.click();
  await expect(notesList.locator('.note-item')).toHaveCount(2, { timeout: 5000 });

  // Delete "Second note" by finding its specific delete button
  const secondNote = notesList.locator('.note-item', { hasText: 'Second note' });
  await secondNote.locator('.note-delete').click();

  // Only "First note" should remain
  await expect(notesList.locator('.note-item')).toHaveCount(1, { timeout: 5000 });
  await expect(notesList.locator('.note-text').first()).toHaveText('First note');
});

test('notes: input clears after add', async ({ page }) => {
  await page.goto('/');

  const input = page.locator('.notes-form input[type="text"]');
  await input.pressSequentially('Test note');
  await page.getByRole('button', { name: 'Add' }).click();

  // Input should be cleared (newNote signal reset to '')
  await expect(input).toHaveValue('', { timeout: 5000 });
});

// --- Interval Timer ---

test('interval: timer ticks', async ({ page }) => {
  await page.goto('/');

  const elapsed = page.locator('[data-text="$elapsed"]');

  // Wait for at least 1 tick
  await expect(async () => {
    const value = await elapsed.textContent();
    expect(Number(value)).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 5000 });
});

// --- Reactive Styles ---

test('reactive styles: bar width changes with counter', async ({ request, page }) => {
  // Reset counter so bar starts at 0%
  await request.post('/api/counter/reset');
  await page.goto('/');

  const bar = page.locator('.bar-fill');

  // At zero, bar should be 0%
  await expect(bar).toHaveText('0%', { timeout: 5000 });

  // Increment counter 3 times → 30%
  const incBtn = page.getByRole('button', { name: 'Increment' });
  await incBtn.click();
  await incBtn.click();
  await incBtn.click();
  await expect(bar).toHaveText('30%', { timeout: 5000 });
});

// --- Signal Inspector ---

test('signal inspector: shows JSON with signal names', async ({ page }) => {
  await page.goto('/');

  const inspector = page.locator('[data-json-signals]');

  // Should contain known signal names
  await expect(inspector).toContainText('count');
  await expect(inspector).toContainText('inputValue');
  await expect(inspector).toContainText('newNote');
  await expect(inspector).toContainText('noteCount');
});
