import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv, BroadcastConfig } from './types'
import counterRoutes from './routes/counter'
import notesRoutes from './routes/notes'

export type { BroadcastConfig } from './types'

export default (bc?: BroadcastConfig) => {
  const app = new OpenAPIHono<AppEnv>()
  app.route('/', counterRoutes(bc))
  app.route('/', notesRoutes(bc))
  return app
}
