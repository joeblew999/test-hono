// @ts-nocheck — page.evaluate runs in browser context with DOM APIs
import { test, expect } from '@playwright/test'
import { SEED_COUNTER_VALUE } from '../sw/seed-data'
import { API, DEFAULT_BASE_URL } from '../constants'

const BASE = process.env.BASE_URL || DEFAULT_BASE_URL
const SEED_COUNT = String(SEED_COUNTER_VALUE)
const SEED_COUNT_PLUS_1 = String(SEED_COUNTER_VALUE + 1)
const SEED_COUNT_PLUS_2 = String(SEED_COUNTER_VALUE + 2)

/** Wait for local mode to initialize: coordinator + wa-sqlite + OPFS.
 *  No reload needed — fetch override is installed synchronously before Datastar. */
async function waitForLocalMode(page: any) {
  await page.goto(`${BASE}/?local`)
  // Wait for counter to populate with seed value (coordinator + worker init)
  await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 15000 })
}

test.describe('Local mode (Leader Election + OPFS)', () => {
  // Clear OPFS before each test so each starts with fresh seeded data
  test.beforeEach(async ({ page }) => {
    // Navigate to origin (non-local) to kill any coordinator/worker
    await page.goto(`${BASE}/`)
    await page.waitForTimeout(300)
    // Clear OPFS storage for wa-sqlite
    await page.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry('wa-sqlite-local', { recursive: true })
      } catch {}
    })
    // Also unregister any leftover Service Workers from old tests
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations() ?? []
      for (const reg of regs) await reg.unregister()
    })
  })

  test('counter works offline with seed data', async ({ page }) => {
    await waitForLocalMode(page)

    // Counter starts at seed value
    await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 3000 })

    // Click increment button — intercepted by fetch override → local Hono app
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })

    // Click again
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_2, { timeout: 3000 })

    // Decrement
    await page.locator('button', { hasText: '\u2212' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })
  })

  test('data persists across page navigations via OPFS', async ({ page }) => {
    await waitForLocalMode(page)

    // Counter starts at seed value, increment by 1
    await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 3000 })
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })

    // Navigate away (kills coordinator + worker, releases OPFS handles)
    await page.goto('about:blank')
    await page.waitForTimeout(300)

    // Navigate back to local mode — new coordinator reads persisted OPFS data
    await page.goto(`${BASE}/?local`)
    // Counter should still be seed+1 (persisted in OPFS)
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 15000 })
  })

  test('online→offline round-trip: counter never shows zero', async ({ page, request }) => {
    // Set server counter to a known value (7) so we can distinguish online vs offline vs zero
    await request.post(`${BASE}${API.COUNTER_RESET}`)
    for (let i = 0; i < 7; i++) {
      await request.post(`${BASE}${API.COUNTER_INCREMENT}`)
    }

    // Start in online mode — verify counter shows 7
    await page.goto(`${BASE}/`)
    await expect(page.locator('.count')).toHaveText('7', { timeout: 5000 })

    // Install a MutationObserver to catch if counter ever shows "0" during transitions
    await page.evaluate(() => {
      (window as any).__counterHistory = []
      const el = document.querySelector('.count')!
      const obs = new MutationObserver(() => {
        const text = el.textContent?.trim() ?? ''
        if (text) (window as any).__counterHistory.push(text)
      })
      obs.observe(el, { childList: true, characterData: true, subtree: true })
    })

    // Switch to local mode via ?local — counter should show seed value (42), never "0"
    await page.goto(`${BASE}/?local`)
    await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 15000 })

    // Verify counter is specifically NOT "0" or "7" (should be seed=42)
    const localCount = await page.locator('.count').textContent()
    expect(localCount?.trim()).toBe(SEED_COUNT)
    expect(localCount?.trim()).not.toBe('0')
    expect(localCount?.trim()).not.toBe('7')

    // Increment works in local mode (42→43)
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })

    // Switch back to online mode (Go Online button)
    await page.locator('#local-exit-btn').click()
    await page.waitForURL(`${BASE}/`)

    // Online counter should show 7 (server value), not 42/43 (local) and not 0
    await expect(page.locator('.count')).toHaveText('7', { timeout: 5000 })
    const onlineCount = await page.locator('.count').textContent()
    expect(onlineCount?.trim()).toBe('7')
    expect(onlineCount?.trim()).not.toBe('0')
    expect(onlineCount?.trim()).not.toBe(SEED_COUNT)
  })

  test('clear data button resets local state to seed values', async ({ page }) => {
    await waitForLocalMode(page)

    // Increment counter from seed → seed+1
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })

    // Click Clear Data button — navigates to /?clear (kills coordinator), clears OPFS, redirects to /?local
    await page.locator('#local-clear-btn').click()

    // Wait for redirect chain: /?clear → OPFS wipe → /?local
    await page.waitForURL(`${BASE}/?local`, { timeout: 15000 })

    // After clear + redirect, counter should be back to seed value (42)
    await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 15000 })
    // Verify we're in local mode
    expect(page.url()).toContain('?local')
  })

  test('sync pushes local state to the real server', async ({ page, request }) => {
    // Reset server state first
    await request.post(`${BASE}${API.COUNTER_RESET}`)

    // Enter local mode, make changes
    await waitForLocalMode(page)

    // Increment counter from seed → seed+1
    await expect(page.locator('.count')).toHaveText(SEED_COUNT, { timeout: 3000 })
    await page.locator('button', { hasText: '+' }).click()
    await expect(page.locator('.count')).toHaveText(SEED_COUNT_PLUS_1, { timeout: 3000 })

    // Trigger sync via API (goes through fetch override → local Hono app → origFetch to server)
    const syncResult: any = await page.evaluate(async (syncUrl: string) => {
      const res = await fetch(syncUrl, { method: 'POST' })
      return res.json()
    }, API.LOCAL_SYNC)
    expect(syncResult.synced).toBe(true)
    expect(syncResult.counter).toBe(SEED_COUNTER_VALUE + 1)

    // Verify server state via Playwright's request fixture (bypasses page's fetch override)
    const counterRes = await request.get(`${BASE}${API.COUNTER}`)
    const counterData = await counterRes.json()
    expect(counterData.count).toBe(SEED_COUNTER_VALUE + 1)
  })
})
