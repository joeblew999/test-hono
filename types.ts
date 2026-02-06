export type AppEnv = { Bindings: { DB: D1Database } }

export type BroadcastConfig = {
  subscribe: (listener: (data: Record<string, unknown>) => void) => () => void
  broadcast: (data: Record<string, unknown>) => void
}
