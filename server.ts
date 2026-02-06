import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { serveStatic } from 'hono/bun'
import { mkdirSync } from 'node:fs'
import { initDB, createD1Compat } from './db'
import api, { type BroadcastConfig } from './api'

// Initialize SQLite
const dbPath = process.env.DB_PATH || './data/counter.db'
mkdirSync(dbPath.substring(0, dbPath.lastIndexOf('/')), { recursive: true })
const sqliteDb = initDB(dbPath)
const d1 = createD1Compat(sqliteDb)

// Broadcast: persistent SSE push to all connected clients
type Listener = (data: { count: number }) => void
const listeners = new Set<Listener>()

const broadcastConfig: BroadcastConfig = {
  broadcast(data) {
    for (const fn of listeners) fn(data)
  },
  subscribe(listener) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}

// App
const app = new OpenAPIHono()

// Inject D1-compatible DB into every request's env
app.use('/api/*', async (c, next) => {
  ;(c.env as any).DB = d1
  await next()
})

app.route('/api', api(broadcastConfig))

app.doc31('/api/doc', {
  openapi: '3.1.0',
  info: {
    version: '1.0.0',
    title: 'Hono Datastar API (Bun + SQLite)',
    description: 'Counter API with persistent SSE broadcast. Same routes as Workers, but with real-time push.',
  },
  tags: [
    { name: 'Counter', description: 'Read, increment, decrement, and reset the shared counter.' },
  ],
  servers: [
    { url: 'http://localhost:3000', description: 'Local dev (Bun)' },
  ],
})

app.get('/ui', Scalar({ url: '/api/doc' }))

// Static files (same ./static directory as Workers)
app.use('/*', serveStatic({ root: './static' }))

const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Bun server running at http://localhost:${port} (persistent SSE enabled)`)

export default {
  port,
  fetch: app.fetch,
}
