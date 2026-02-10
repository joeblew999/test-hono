import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types'
import counterRoutes from '../routes/counter'
import notesRoutes from '../routes/notes'

/** Slim route composer for Service Worker mode: counter + notes only (no auth/tasks/MCP) */
export default () => {
  const app = new OpenAPIHono<AppEnv>()
  app.route('/', counterRoutes())
  app.route('/', notesRoutes())
  return app
}
