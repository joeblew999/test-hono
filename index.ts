import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from './types'
import api from './api'
import { mountDocs } from './docs'

const app = new OpenAPIHono<AppEnv>()

app.route('/api', api())

mountDocs(app, {
  title: 'Hono Datastar API',
  description: 'Counter API backed by Cloudflare D1 (SQLite) with a Datastar SSE frontend.',
  servers: [
    { url: 'https://test-hono.gedw99.workers.dev', description: 'Production' },
    { url: 'http://localhost:8787', description: 'Local dev' },
  ],
})

export default app
