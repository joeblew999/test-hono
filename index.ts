import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import api from './api'

type Bindings = {
  DB: D1Database
}

const app = new OpenAPIHono<{ Bindings: Bindings }>()

// Mount the API routes (content-negotiated: JSON for API clients, SSE for Datastar)
app.route('/api', api())

// OpenAPI 3.1 documentation
app.doc31('/api/doc', {
  openapi: '3.1.0',
  info: {
    version: '1.0.0',
    title: 'Hono Datastar API',
    description: 'Counter API backed by Cloudflare D1 (SQLite) with a Datastar SSE frontend.',
  },
  tags: [
    {
      name: 'Counter',
      description: 'Read, increment, decrement, and reset the shared counter.',
    },
  ],
  servers: [
    { url: 'https://test-hono.gedw99.workers.dev', description: 'Production' },
    { url: 'http://localhost:8787', description: 'Local dev' },
  ],
})

// Scalar API Reference
app.get('/ui', Scalar({ url: '/api/doc' }))

export default app
