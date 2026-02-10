import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv, BroadcastConfig } from './types'
import counterRoutes from './routes/counter'
import notesRoutes from './routes/notes'
import tasksRoutes from './routes/tasks'
import sessionsRoutes from './routes/sessions'

export type { BroadcastConfig } from './types'

export default (bc?: BroadcastConfig) => {
  const app = new OpenAPIHono<AppEnv>()
  app.route('/', counterRoutes(bc))
  app.route('/', notesRoutes(bc))
  app.route('/', tasksRoutes(bc))
  app.route('/', sessionsRoutes(bc))
  return app
}
