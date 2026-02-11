import { test, expect } from '@playwright/test'
import { SEED_COUNTER_VALUE } from '../sw/seed-data'
import { API, DEFAULT_BASE_URL } from '../constants'

const BASE = process.env.BASE_URL || DEFAULT_BASE_URL
const SEED_COUNT = String(SEED_COUNTER_VALUE)
const SEED_COUNT_PLUS_1 = String(SEED_COUNTER_VALUE + 1)
const SEED_COUNT_PLUS_2 = String(SEED_COUNTER_VALUE + 2)

/** Wait for SW to register, activate, and claim the page.
 *  The page auto-reloads on first controllerchange so all data-init SSE connections go through the SW. */
async function waitForSW(page: any) {
  await page.goto(`${BASE}/?local`)

  // Page auto-reloads when SW first activates (controllerchange → location.reload).
  // Poll across potential reload to verify SW controller is set.
  for (let i = 0; i < 30; i++) {
    try {
      const ok = await page.evaluate(() => !!navigator.serviceWorker?.controller)
      if (ok) return
    } catch {
      // Page might be mid-reload, retry
    }
    await page.waitForTimeout(500)
  }
  throw new Error('SW did not activate within 15s')
}

test.describe('Service Worker (local mode)', () => {
  // Clear IndexedDB before each test so each starts with fresh seeded data
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/?local`)
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('sw-sqljs')
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })
    })
    // Unregister any existing SW so it re-initializes with fresh DB
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const reg of regs) await reg.unregister()
    })
  })

  test('registers SW and counter works offline with seed data', async ({ page }) => {
    await waitForSW(page)

    // Counter starts at seed value
    await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 3000 })

    // Click increment button — should be intercepted by SW
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })

    // Click again
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_2, { timeout: 3000 })

    // Decrement
    await page.locator('button', { hasText: '\u2212' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })
  })

  test('data persists across SW restarts via IndexedDB', async ({ page }) => {
    await waitForSW(page)

    // Counter starts at seed value, increment by 1
    await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 3000 })
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })

    // Unregister SW (simulates browser restart)
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const reg of regs) await reg.unregister()
    })

    // Re-register SW — it should restore DB from IndexedDB
    await waitForSW(page)

    // Counter should still be seed+1 (persisted in IndexedDB)
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 5000 })
  })

  test('sync pushes local state to the real server', async ({ page, request }) => {
    // Reset server state first
    await request.post(`${BASE}${API.COUNTER_RESET}`)

    // Enter local mode, make changes
    await waitForSW(page)

    // Increment counter from seed → seed+1
    await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 3000 })
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })

    // Trigger sync via API (same as clicking the Sync button)
    const syncResult: any = await page.evaluate(async (syncUrl: string) => {
      const res = await fetch(syncUrl, { method: 'POST' })
      return res.json()
    }, API.LOCAL_SYNC)
    expect(syncResult.synced).toBe(true)
    expect(syncResult.counter).toBe(SEED_COUNTER_VALUE + 1)

    // Unregister SW so subsequent fetches hit the real server
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const reg of regs) await reg.unregister()
    })

    // Verify server state via API (bypassing any SW)
    const counterRes = await request.get(`${BASE}${API.COUNTER}`)
    const counterData = await counterRes.json()
    expect(counterData.count).toBe(SEED_COUNTER_VALUE + 1)
  })
})
