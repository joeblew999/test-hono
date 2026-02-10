import { OpenAPIHono } from '@hono/zod-openapi'
import { serveStatic } from 'hono/bun'
import { bearerAuth } from 'hono/bearer-auth'
import { mkdirSync } from 'node:fs'
import { initDB, createD1Compat } from './db/bun'
import { initCorrosionDB, applyCrSqlChanges } from './corrosion/db'
import { startLocalCorrosionAgent } from './corrosion/local-manager'
import { startCorrosionSyncManager } from './corrosion/sync-manager'
import type { AppEnv, BroadcastConfig } from './types'
import api from './api'
import { mountDocs } from './lib/docs'
import { getAuth, requireAuth, handleSessionCheck } from './lib/auth'
import { handleMcpRequest } from './lib/mcp'
import { CrChangesetsSchema } from './validators'
import { seedDemoUsers, seedDemoData, getPublicDemoCredentials } from './lib/demo'
import { respond } from './sse'

// Initialize SQLite
const dbPath = process.env.DB_PATH || './data/counter.db'
mkdirSync(dbPath.substring(0, dbPath.lastIndexOf('/')), { recursive: true })

let d1: D1Database;
let corrosionAgentUrl: string | undefined;

// Determine if running in production (e.g., on Fly.io)
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.FLY_APP;

if (process.env.USE_CORROSION_DB === 'true') {
  if (!isProduction) {
    // Local development with Corrosion: start Corrosion agent programmatically
    corrosionAgentUrl = await startLocalCorrosionAgent();
    console.log(`Using programmatically started Corrosion DB from: ${corrosionAgentUrl}`);
    d1 = await initCorrosionDB(corrosionAgentUrl);
  } else {
    // Deployed environment with Corrosion: assume agent is managed externally (e.g., by Fly.io processes)
    corrosionAgentUrl = process.env.CORROSION_AGENT_URL;
    if (!corrosionAgentUrl) {
      throw new Error('CORROSION_AGENT_URL environment variable must be set when USE_CORROSION_DB is true in production.');
    }
    console.log(`Using deployed Corrosion DB from: ${corrosionAgentUrl}`);
    d1 = await initCorrosionDB(corrosionAgentUrl);
  }
} else {
  console.log(`Using bun:sqlite DB from: ${dbPath}`);
  const sqliteDb = initDB(dbPath);
  d1 = createD1Compat(sqliteDb);
}

// Broadcast: persistent SSE push to all connected clients
type Listener = (data: Record<string, unknown>) => void
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

// Start Corrosion Sync Manager if USE_CORROSION_DB is enabled
if (process.env.USE_CORROSION_DB === 'true' && corrosionAgentUrl) {
  startCorrosionSyncManager(d1, broadcastConfig, corrosionAgentUrl);
}

// App
const app = new OpenAPIHono<AppEnv>()

// Inject D1-compatible DB and auth env vars into every request
app.use('*', async (c, next) => {
  ;(c.env as any).DB = d1
  ;(c.env as any).BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'dev-secret-change-in-production'
  ;(c.env as any).BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || '3000'}`
  ;(c.env as any).DEMO_MODE = process.env.DEMO_MODE
  await next()
})

// Seed demo users on first request
let demoSeeded = false
app.use('*', async (c, next) => {
  if (!demoSeeded) {
    demoSeeded = true
    await seedDemoUsers(c)
    await seedDemoData(c)
  }
  await next()
})

// Clean URL for login page
app.get('/login', (c) => c.redirect('/login.html'))

// Demo credentials (returns empty array when DEMO_MODE off)
app.get('/api/demo-credentials', (c) => {
  return respond(c, { demoCredentials: getPublicDemoCredentials(c) })
})

// Session check (SSE signals for Datastar, JSON for API clients)
app.get('/api/session', handleSessionCheck)

// Better Auth handler
app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
  const auth = getAuth(c)
  return auth.handler(c.req.raw)
})

app.route('/api', api(broadcastConfig))

// MCP endpoint — shared auth + handler
app.all('/mcp', requireAuth, handleMcpRequest)

// Sync endpoint (Bun/Fly.io only — not available on Workers)
if (process.env.USE_CORROSION_DB === 'true') {
  app.use('/api/sync/*', bearerAuth({
    token: process.env.SYNC_API_KEY || '',
    headerName: 'X-API-Key',
    prefix: '',
  }));

  // Endpoint for receiving CR-SQLite changesets from desktop clients
  app.post('/api/sync/changesets', async (c) => {
    const raw = await c.req.json();
    const parsed = CrChangesetsSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'Invalid changeset payload', details: parsed.error.issues }, 400);
    }

    try {
      await applyCrSqlChanges(d1, parsed.data);
      return c.json({ success: true, message: `Applied ${parsed.data.length} changes.` });
    } catch (error) {
      console.error('Error applying changesets:', error);
      return c.json({ error: 'Failed to apply changesets.', details: (error as Error).message }, 500);
    }
  });
}

mountDocs(app, {
  title: 'Hono Datastar API (Bun + SQLite)',
  description: 'Counter API with persistent SSE broadcast, MCP tools for AI agents, and Better Auth.',
  servers: [
    { url: 'http://localhost:3000', description: 'Local dev (Bun)' },
  ],
})

// Static files (same ./static directory as Workers)
app.use('/*', serveStatic({ root: './static' }))

const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Bun server running at http://localhost:${port} (persistent SSE enabled)`)

export default {
  port,
  fetch: app.fetch,
}
