import { test, expect } from '@playwright/test'
import { API, DEFAULT_BASE_URL } from '../constants'
import { signInViaLoginPage } from './fixtures'

const VIDEO_SIZE = { width: 640, height: 720 }

test('sync demo: cross-tab live updates via persistent SSE', async ({ browser, request }) => {
  // Reset counter (public endpoint)
  await request.post(API.COUNTER_RESET)

  const baseURL = test.info().project.use.baseURL || DEFAULT_BASE_URL

  // Two separate contexts = two separate video files
  const ctxA = await browser.newContext({
    recordVideo: { dir: 'docs/videos/sync-tab-a', size: VIDEO_SIZE },
  })
  const ctxB = await browser.newContext({
    recordVideo: { dir: 'docs/videos/sync-tab-b', size: VIDEO_SIZE },
  })

  const tabA = await ctxA.newPage()
  const tabB = await ctxB.newPage()

  // Sign in both tabs (notes require auth)
  await signInViaLoginPage(tabA, 'demo@example.com', 'demo1234')
  await signInViaLoginPage(tabB, 'demo@example.com', 'demo1234')

  // Reset notes after sign-in (auth required)
  await tabA.evaluate((url) => fetch(url, { method: 'POST' }), API.NOTES_RESET)

  // Both tabs navigate and load initial state
  await tabA.goto(baseURL)
  await tabB.goto(baseURL)

  // Wait for SSE streams to connect and deliver initial data
  await expect(tabA.locator('[data-text="$count"]')).toHaveText('0', { timeout: 5000 })
  await expect(tabB.locator('[data-text="$count"]')).toHaveText('0', { timeout: 5000 })

  // Pause so viewer sees both tabs at zero
  await tabA.waitForTimeout(1500)

  // --- Counter sync ---
  // Tab A increments 3 times
  const incBtn = tabA.getByRole('button', { name: 'Increment' })
  await incBtn.click()
  await tabA.waitForTimeout(400)
  await incBtn.click()
  await tabA.waitForTimeout(400)
  await incBtn.click()

  // Tab A shows 3 immediately
  await expect(tabA.locator('[data-text="$count"]')).toHaveText('3')

  // Tab B syncs within ~2-3s via D1 polling (the magic moment)
  await expect(tabB.locator('[data-text="$count"]')).toHaveText('3', { timeout: 6000 })

  // Pause to let viewer appreciate the sync
  await tabA.waitForTimeout(1500)

  // --- Notes sync ---
  // Tab A adds a note
  await tabA.locator('.notes-form input[type="text"]').pressSequentially('Synced from Tab A!')
  await tabA.getByRole('button', { name: 'Add', exact: true }).click()

  // Tab A shows the note immediately
  await expect(tabA.locator('.note-item', { hasText: 'Synced from Tab A!' })).toBeVisible()

  // Tab B shows the note via persistent polling (within ~2-3s)
  await expect(tabB.locator('.note-item', { hasText: 'Synced from Tab A!' })).toBeVisible({ timeout: 6000 })

  // Final pause
  await tabA.waitForTimeout(2000)

  // Close contexts to finalize video files
  await ctxA.close()
  await ctxB.close()
})
