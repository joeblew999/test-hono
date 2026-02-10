import { Scalar } from '@scalar/hono-api-reference'
import type { OpenAPIHono } from '@hono/zod-openapi'

type DocsConfig = {
  title: string
  description: string
  servers: { url: string; description: string }[]
}

export function mountDocs(app: OpenAPIHono<any>, config: DocsConfig) {
  app.doc31('/api/doc', {
    openapi: '3.1.0',
    info: {
      version: '1.0.0',
      title: config.title,
      description: config.description,
    },
    tags: [
      { name: 'Counter', description: 'Read, increment, decrement, and reset the shared counter.' },
      { name: 'Tasks', description: 'Authenticated task CRUD (also exposed as MCP tools).' },
      { name: 'Admin', description: 'Admin user management (Better Auth admin plugin, auto-mounted under /api/auth/admin/).' },
    ],
    servers: config.servers,
  })

  app.get('/ui', Scalar({ url: '/api/doc' }))
}
