import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, '../docs/screenshots');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  // Reset to clean state for screenshots
  await request.post('/api/counter/reset');
  await request.post('/api/notes/reset');
});

test('screenshot: full page at zero', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500); // let data-init load + clock tick

  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/full-page.png`,
    fullPage: true,
  });
});

test('screenshot: counter positive', async ({ page }) => {
  await page.goto('/');
  const inc = page.getByRole('button', { name: 'Increment' });
  await inc.click();
  await inc.click();
  await inc.click();
  await inc.click();
  await inc.click();
  // Wait for SSE response
  await expect(page.locator('[data-text="$count"]')).toHaveText('5', { timeout: 5000 });

  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/counter-positive.png`,
    fullPage: true,
  });
});

test('screenshot: notes with items', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#notes-list')).toContainText('No notes yet', { timeout: 5000 });

  const input = page.locator('.notes-form input[type="text"]');
  const addBtn = page.getByRole('button', { name: 'Add' });

  await input.pressSequentially('Learn Datastar RC.7 patterns');
  await addBtn.click();
  await expect(page.locator('.note-item')).toHaveCount(1, { timeout: 5000 });

  await input.pressSequentially('Build with Hono + OpenAPI');
  await addBtn.click();
  await expect(page.locator('.note-item')).toHaveCount(2, { timeout: 5000 });

  await input.pressSequentially('Deploy to Workers + Fly.io');
  await addBtn.click();
  await expect(page.locator('.note-item')).toHaveCount(3, { timeout: 5000 });

  // Scroll notes section into view
  await page.locator('#notes-list').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/notes-crud.png`,
    fullPage: true,
  });
});

test('screenshot: hero section (cropped)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);

  // Crop to just the header + counter section
  const header = page.locator('header');
  await header.screenshot({
    path: `${SCREENSHOTS_DIR}/hero.png`,
  });
});
