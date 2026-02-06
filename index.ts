import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { streamSSE } from 'hono/streaming'
import api from './api'

// Server-side counter — the single source of truth.
// Works correctly across multiple tabs and Swagger UI.
// NOTE: Workers can't share I/O objects between requests,
// so persistent SSE broadcast is not possible without Durable Objects.
let serverCount = 0

const app = new OpenAPIHono()

// Mount the API routes (OpenAPI/JSON for Swagger UI)
app.route('/api', api({ getCount: () => serverCount, setCount: (n: number) => { serverCount = n } }))

// Datastar action endpoint for increment (returns SSE)
app.post('/actions/counter/increment', async (c) => {
  serverCount++

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: `signals ${JSON.stringify({ count: serverCount })}`,
      event: 'datastar-patch-signals',
    })
  })
})

// Datastar action endpoint for decrement (returns SSE)
app.post('/actions/counter/decrement', async (c) => {
  serverCount--

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: `signals ${JSON.stringify({ count: serverCount })}`,
      event: 'datastar-patch-signals',
    })
  })
})

// Reset endpoint for testing
app.post('/api/counter/reset', (c) => {
  serverCount = 0
  return c.json({ count: serverCount })
})

// SSE endpoint — returns current server count and closes.
// Datastar uses this on page load to sync with server state.
app.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: `signals ${JSON.stringify({ count: serverCount })}`,
      event: 'datastar-patch-signals',
    })
  })
})

// OpenAPI documentation
app.doc('/api/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Hono Datastar API',
  },
})

// Swagger UI
app.get('/ui', swaggerUI({ url: '/api/doc' }))

export default app

export type ApiRoutes = typeof api
