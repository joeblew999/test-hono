/// <reference lib="webworker" />
import { Hono } from 'hono'
import { handle } from 'hono/service-worker'
import { initSqlJsDB, createD1Compat } from './sqljs-adapter'
import swApi from './sw-api'

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

// Mount API routes (counter + notes)
app.route('/api', swApi())

// Register fetch handler — Hono routes intercept /api/*, everything else falls through to network
self.addEventListener('fetch', handle(app))
