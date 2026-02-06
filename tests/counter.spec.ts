import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/counter/reset');
});

test('counter should increment on click', async ({ page }) => {
  await page.goto('/');

  const counterSpan = page.locator('[data-text="$count"]');
  await expect(counterSpan).toHaveText('0');

  const incrementButton = page.getByRole('button', { name: 'Increment' });

  await incrementButton.click();
  await expect(counterSpan).toHaveText('1');

  await incrementButton.click();
  await expect(counterSpan).toHaveText('2');
});

test('counter should decrement on click', async ({ page }) => {
  await page.goto('/');

  const counterSpan = page.locator('[data-text="$count"]');
  await expect(counterSpan).toHaveText('0');

  const decrementButton = page.getByRole('button', { name: 'Decrement' });

  await decrementButton.click();
  await expect(counterSpan).toHaveText('-1');

  await decrementButton.click();
  await expect(counterSpan).toHaveText('-2');
});

test('increment and decrement work together', async ({ page }) => {
  await page.goto('/');

  const counterSpan = page.locator('[data-text="$count"]');
  await expect(counterSpan).toHaveText('0');

  const incrementButton = page.getByRole('button', { name: 'Increment' });
  const decrementButton = page.getByRole('button', { name: 'Decrement' });

  await incrementButton.click();
  await expect(counterSpan).toHaveText('1');

  await incrementButton.click();
  await expect(counterSpan).toHaveText('2');

  await decrementButton.click();
  await expect(counterSpan).toHaveText('1');
});

test('multi-tab: server state is shared across tabs', async ({ browser }) => {
  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  const baseURL = test.info().project.use.baseURL || 'http://localhost:8787';

  await page1.goto(baseURL);
  await page2.goto(baseURL);

  const counter1 = page1.locator('[data-text="$count"]');
  const counter2 = page2.locator('[data-text="$count"]');

  await expect(counter1).toHaveText('0');
  await expect(counter2).toHaveText('0');

  // Increment on page1
  await page1.getByRole('button', { name: 'Increment' }).click();
  await expect(counter1).toHaveText('1');

  // Page2 gets server count on its next action
  await page2.getByRole('button', { name: 'Increment' }).click();
  await expect(counter2).toHaveText('2');

  // Decrement from page1
  await page1.getByRole('button', { name: 'Decrement' }).click();
  await expect(counter1).toHaveText('1');

  // Page2 increments — gets latest server count
  await page2.getByRole('button', { name: 'Increment' }).click();
  await expect(counter2).toHaveText('2');

  await context.close();
});
