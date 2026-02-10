import type { DrizzleD1Database } from 'drizzle-orm/d1'

export type AppEnv = {
  Bindings: {
    DB: D1Database
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    DEMO_MODE?: string
  }
  Variables: {
    user: { id: string; name: string; email: string; role: string } | null
    session: { id: string; userId: string; token: string; expiresAt: string } | null
    drizzleDb: DrizzleD1Database
  }
}

export type BroadcastConfig = {
  subscribe: (listener: (data: Record<string, unknown>) => void) => () => void
  broadcast: (data: Record<string, unknown>) => void
}
