import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from './types'
import api from './api'
import { mountDocs } from './lib/docs'
import { getAuth, requireAuth, handleSessionCheck } from './lib/auth'
import { handleMcpRequest } from './lib/mcp'
import { seedDemoUsers, seedDemoData, getPublicDemoCredentials } from './lib/demo'
import { respond } from './sse'
import { DEFAULT_BASE_URL } from './constants'

const app = new OpenAPIHono<AppEnv>()

// Seed demo users on first request (Workers can't run code at module level)
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

// API routes (counter + notes are public, tasks has its own auth middleware)
app.route('/api', api())

// MCP endpoint — shared auth + handler
app.all('/mcp', requireAuth, handleMcpRequest)

mountDocs(app, {
  title: 'Hono Datastar API',
  description: 'Counter API backed by Cloudflare D1 (SQLite) with a Datastar SSE frontend, MCP tools for AI agents, and Better Auth.',
  servers: [
    { url: 'https://test-hono.gedw99.workers.dev', description: 'Production' },
    { url: DEFAULT_BASE_URL, description: 'Local dev' },
  ],
})

export default app
