import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins/admin'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle as drizzleD1, drizzle } from 'drizzle-orm/d1'
import type { Context, MiddlewareHandler } from 'hono'
import type { AppEnv } from './types'
import { respond } from './sse'
import * as schema from './schema'

/** Create a Better Auth instance per-request (D1 is only available in request context). */
export function getAuth(c: Context<AppEnv>) {
  const db = drizzleD1(c.env.DB, { schema })
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.userTable,
        session: schema.sessionTable,
        account: schema.accountTable,
        verification: schema.verificationTable,
      },
    }),
    secret: c.env.BETTER_AUTH_SECRET,
    baseURL: c.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
      }),
    ],
  })
}

/** Middleware: verify session, set user/session/drizzleDb on context. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = getAuth(c)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.set('user', session.user as any)
  c.set('session', session.session as any)
  c.set('drizzleDb', drizzle(c.env.DB))
  await next()
}

/** Handler: return current auth state as SSE signals or JSON. */
export async function handleSessionCheck(c: Context<AppEnv>) {
  const auth = getAuth(c)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  const signals = {
    authUser: session?.user?.name || '',
    authRole: (session?.user as any)?.role || '',
  }
  return respond(c, signals)
}

/** Middleware: verify session + require admin role. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = getAuth(c)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.set('user', session.user as any)
  c.set('session', session.session as any)
  c.set('drizzleDb', drizzle(c.env.DB))
  const user = session.user as any
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden: admin role required' }, 403)
  }
  await next()
}
