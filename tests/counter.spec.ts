import { test, expect } from '@playwright/test';
import { API, SEL, DEFAULT_BASE_URL } from '../constants';

test.beforeEach(async ({ request }) => {
  await request.post(API.COUNTER_RESET);
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

test('counter color classes toggle on positive/negative', async ({ page }) => {
  await page.goto('/');

  const countDiv = page.locator('.count');
  await expect(countDiv).toHaveClass(/zero/);

  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(countDiv).toHaveClass(/positive/);
  await expect(countDiv).not.toHaveClass(/zero/);

  await page.getByRole('button', { name: 'Decrement' }).click();
  await page.getByRole('button', { name: 'Decrement' }).click();
  await expect(countDiv).toHaveClass(/negative/);
  await expect(countDiv).not.toHaveClass(/positive/);
});

test('set counter via input field', async ({ page }) => {
  await page.goto('/');

  const counterSpan = page.locator('[data-text="$count"]');
  await expect(counterSpan).toHaveText('0');

  await page.locator('input[type="number"]').fill('42');
  await page.getByRole('button', { name: 'Set Counter' }).click();
  await expect(counterSpan).toHaveText('42');
});

test('conditional messages show/hide correctly', async ({ page }) => {
  await page.goto('/');

  const counterSpan = page.locator('[data-text="$count"]');
  await expect(counterSpan).toHaveText('0');

  // At zero: "Counter is zero" and "Even number" visible
  await expect(page.locator('.message.gray')).toBeVisible();
  await expect(page.locator('.message.blue')).toBeVisible();
  await expect(page.locator('.message.green')).not.toBeVisible();
  await expect(page.locator('.message.red')).not.toBeVisible();

  // Increment to 1: positive + odd
  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(page.locator('.message.green')).toBeVisible();
  await expect(page.locator('.message.gray')).not.toBeVisible();
  await expect(page.locator('.message.blue')).not.toBeVisible();

  // Increment to 2: positive + even
  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(page.locator('.message.green')).toBeVisible();
  await expect(page.locator('.message.blue')).toBeVisible();
});

test('server fragment loads HTML', async ({ page }) => {
  await page.goto('/');

  const fragmentBox = page.locator(SEL.SERVER_FRAGMENT);
  await expect(fragmentBox).toContainText('Click to load');

  await page.getByRole('button', { name: 'Load Fragment' }).click();
  await expect(fragmentBox.locator('strong')).toBeVisible();
  await expect(fragmentBox).toContainText('as of');
});

test('computed values display correctly', async ({ page }) => {
  await page.goto('/');

  // At zero: abs=0, parity=even, sign=zero
  await expect(page.locator('[data-text="$abscount"]')).toHaveText('0');
  await expect(page.locator('[data-text="$parity"]')).toHaveText('even');
  await expect(page.locator('[data-text="$sign"]')).toHaveText('zero');

  // Increment to 1: abs=1, parity=odd, sign=positive
  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(page.locator('[data-text="$abscount"]')).toHaveText('1');
  await expect(page.locator('[data-text="$parity"]')).toHaveText('odd');
  await expect(page.locator('[data-text="$sign"]')).toHaveText('positive');

  // Decrement twice to -1: abs=1, parity=odd, sign=negative
  await page.getByRole('button', { name: 'Decrement' }).click();
  await page.getByRole('button', { name: 'Decrement' }).click();
  await expect(page.locator('[data-text="$abscount"]')).toHaveText('1');
  await expect(page.locator('[data-text="$sign"]')).toHaveText('negative');
});

test('multi-tab: server state is shared across tabs', async ({ browser }) => {
  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  const baseURL = test.info().project.use.baseURL || DEFAULT_BASE_URL;

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
