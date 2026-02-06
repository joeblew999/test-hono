import { OpenAPIHono } from '@hono/zod-openapi'
import { serveStatic } from 'hono/bun'
import { mkdirSync } from 'node:fs'
import { initDB, createD1Compat } from './db'
import { initCorrosionDB, applyCrSqlChanges } from './corrosion-db'
import { startLocalCorrosionAgent } from './corrosion-local-manager'
import { startCorrosionSyncManager } from './corrosion-sync-manager'
import type { AppEnv, BroadcastConfig } from './types'
import api from './api'
import { mountDocs } from './docs'

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

// Inject D1-compatible DB into every request's env
app.use('/api/*', async (c, next) => {
  ;(c.env as any).DB = d1
  await next()
})

app.route('/api', api(broadcastConfig))

// Sync endpoint (Bun/Fly.io only — not available on Workers)
if (process.env.USE_CORROSION_DB === 'true') {
  // API Key auth middleware for sync routes
  app.use('/api/sync/*', async (c, next) => {
    const apiKey = c.req.header('X-API-Key');
    const expectedApiKey = process.env.SYNC_API_KEY;

    if (!expectedApiKey) {
      console.error('SYNC_API_KEY is not configured on the server.');
      return c.json({ error: 'Server authentication misconfiguration.' }, 500);
    }

    if (!apiKey || apiKey !== expectedApiKey) {
      return c.json({ error: 'Unauthorized: Invalid or missing API Key.' }, 401);
    }

    await next();
  });

  // Endpoint for receiving CR-SQLite changesets from desktop clients
  app.post('/api/sync/changesets', async (c) => {
    const changesets = await c.req.json() as any[];

    if (!Array.isArray(changesets)) {
      return c.json({ error: 'Request body must be an array of changesets' }, 400);
    }

    try {
      await applyCrSqlChanges(d1, changesets);
      return c.json({ success: true, message: `Applied ${changesets.length} changes.` });
    } catch (error) {
      console.error('Error applying changesets:', error);
      return c.json({ error: 'Failed to apply changesets.', details: (error as Error).message }, 500);
    }
  });
}

mountDocs(app, {
  title: 'Hono Datastar API (Bun + SQLite)',
  description: 'Counter API with persistent SSE broadcast. Same routes as Workers, but with real-time push.',
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
