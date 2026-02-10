import type { DrizzleD1Database } from 'drizzle-orm/d1'

export type McpContext = {
  db: D1Database
  drizzleDb: DrizzleD1Database
  userId: string
}

export function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

export function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}
