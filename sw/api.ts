import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types'
import counterRoutes from '../routes/counter'

/** Slim OpenAPI route composer for local-first mode: counter only (no auth/notes/tasks/MCP) */
export default () => {
  const app = new OpenAPIHono<AppEnv>()
  app.route('/', counterRoutes())
  return app
}
