import { HTTPException } from 'hono/http-exception'
import type { Context, MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

/** Global error handler — returns structured JSON for all unhandled exceptions. */
export function errorHandler(err: Error, c: Context<AppEnv>) {
  console.error(`[${c.req.method}] ${c.req.path}:`, err)

  const status = err instanceof HTTPException ? err.status : 500
  const message = err instanceof HTTPException ? err.message : 'Internal server error'

  return c.json({ error: message, status }, status as any)
}

/** Return structured JSON 404 instead of Hono's default HTML. */
export function notFound(c: Context<AppEnv>) {
  return c.json({ error: 'Not found', status: 404 }, 404)
}

/** Security headers middleware — applied to every response. */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '0')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}
