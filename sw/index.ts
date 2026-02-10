/// <reference lib="webworker" />
import { Hono } from 'hono'
import { handle } from 'hono/service-worker'
import { initSqlJsDB, createD1Compat, getMutationCount, resetMutationCount } from './sqljs-adapter'
import { getCount } from '../queries'
import { API } from '../constants'
import swApi from './api'

declare const self: ServiceWorkerGlobalScope

const app = new Hono()
let db: D1Database | null = null
let dbReady: Promise<void>

// Init sql.js on Service Worker install
self.addEventListener('install', (event) => {
  dbReady = initSqlJsDB('/sql-wasm.wasm').then((sqlDb) => {
    db = createD1Compat(sqlDb)
  })
  event.waitUntil(dbReady)
  // Skip waiting so the new SW activates immediately
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Claim all open clients so the SW handles fetches immediately
  event.waitUntil(self.clients.claim())
})

// Inject DB into env for each API request
app.use('/api/*', async (c, next) => {
  // Ensure DB is initialized (handles race between activate and first fetch)
  await dbReady
  ;(c.env as any).DB = db
  await next()
})

// Mount API routes (counter only)
app.route('/api', swApi())

// Local mode status — returns mutation count for the banner
app.get(API.LOCAL_STATUS, async (c) => {
  return c.json({ mutations: getMutationCount() })
})

// Sync local data to server — SW fetch() bypasses itself, hits the real server
app.post(API.LOCAL_SYNC, async (c) => {
  await dbReady
  const origin = self.location.origin

  try {
    // Read local state via query layer
    const count = await getCount(db!)

    // Sync counter to server (field: inputValue per SetCountSchema)
    const counterRes = await fetch(`${origin}${API.COUNTER_SET}`, {
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

// Register fetch handler — Hono routes intercept /api/*, everything else falls through to network
self.addEventListener('fetch', handle(app))
