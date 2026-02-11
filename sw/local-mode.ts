// @ts-nocheck — This file is bundled for the browser, not Cloudflare Workers
/**
 * Local mode entry point — bundled into static/local-mode.js
 *
 * Creates the coordinator (leader election), Hono app with counter routes,
 * and resolves the page-level fetch handler so Datastar requests are intercepted.
 *
 * The page's inline <script> installs a fetch override BEFORE this module loads.
 * That override awaits `window.__resolveLocal(handler)` before routing /api/* calls.
 */

import { Hono } from 'hono'
import { initCoordinator } from './db-coordinator'
import { getCount } from '../queries'
import { API } from '../constants'
import swApi from './api'

declare global {
  interface Window {
    __resolveLocal: (handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => void
    __origFetch: typeof fetch
    __localRole?: string
  }
}

async function init() {
  const { db, role, getMutationCount, resetMutationCount } = await initCoordinator()

  // Create Hono app with counter routes
  const app = new Hono()

  // Inject DB into env for each request
  app.use('/api/*', async (c, next) => {
    ;(c.env as any).DB = db
    await next()
  })

  // Mount counter routes
  app.route('/api', swApi())

  // Local status — mutation count for banner
  app.get(API.LOCAL_STATUS, async (c) => {
    return c.json({ mutations: getMutationCount() })
  })

  // Sync local data to server (uses original fetch to bypass our override)
  app.post(API.LOCAL_SYNC, async (c) => {
    const origFetch = window.__origFetch
    try {
      const count = await getCount(db)
      const counterRes = await origFetch(`${location.origin}${API.COUNTER_SET}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputValue: count }),
      })
      if (!counterRes.ok) throw new Error(`Counter sync failed: ${counterRes.status}`)
      resetMutationCount()
      return c.json({ synced: true, counter: count })
    } catch (e: any) {
      return c.json({ synced: false, error: e.message }, 500)
    }
  })

  // Expose role for the banner badge
  window.__localRole = role

  // Update role badge if already rendered
  const roleBadge = document.getElementById('local-role-badge')
  if (roleBadge) roleBadge.textContent = role

  // Resolve the fetch handler — queued /api/* requests start flowing
  window.__resolveLocal(async (input: RequestInfo | URL, init?: RequestInit) => {
    // Preserve original Request's headers/method/body (Datastar passes Request objects)
    const req = input instanceof Request
      ? input
      : new Request(typeof input === 'string' ? input : input.href, init)
    return app.fetch(req, { DB: db })
  })

  console.log(`[local-mode] Ready (${role})`)
}

init().catch(err => console.error('[local-mode] Init failed:', err))
