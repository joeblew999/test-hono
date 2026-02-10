import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:8787'

/** Wait for SW to register, activate, and claim the page */
async function waitForSW(page: any) {
  // Register SW
  await page.goto(`${BASE}/?local`)

  // Wait for SW to be registered
  await page.waitForFunction(() => {
    return navigator.serviceWorker?.ready !== undefined
  }, null, { timeout: 10000 })

  // Wait for SW to claim this page (skipWaiting + clients.claim)
  const claimed = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    // If controller is already set, we're good
    if (navigator.serviceWorker.controller) return true
    // Otherwise wait for controllerchange event
    return new Promise<boolean>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true))
      // Timeout fallback
      setTimeout(() => resolve(false), 8000)
    })
  })

  if (!claimed) {
    // Reload to let SW intercept — fallback for slow activation
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 })
  }
}

test.describe('Service Worker (local mode)', () => {
  test('registers SW and counter works offline', async ({ page }) => {
    await waitForSW(page)

    // Reload so all data-init requests go through SW
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 })

    // Click increment button — should be intercepted by SW
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText('1', { timeout: 3000 })

    // Click again
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText('2', { timeout: 3000 })

    // Decrement
    await page.locator('button', { hasText: '−' }).click()
    await expect(page.locator('.count')).toHaveText('1', { timeout: 3000 })
  })

  test('notes CRUD works through SW', async ({ page }) => {
    await waitForSW(page)

    // Reload so all data-init requests go through SW
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 })

    // Add a note
    const input = page.locator('input[data-bind="newNote"]')
    await input.pressSequentially('SW test note')
    await page.getByRole('button', { name: 'Add' }).click()

    // Verify note appears
    await expect(page.locator('.note-item', { hasText: 'SW test note' })).toBeVisible({ timeout: 3000 })

    // Delete the note
    await page.locator('.note-item', { hasText: 'SW test note' }).locator('.note-delete').click()
    await expect(page.locator('.note-item', { hasText: 'SW test note' })).not.toBeVisible({ timeout: 3000 })
  })
})
