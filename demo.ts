import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Context } from 'hono'
import type { AppEnv } from './types'
import { getAuth } from './auth'
import { userTable } from './schema'

/** Demo credentials — intentionally public, for try-before-you-sign-up. */
export const DEMO_CREDENTIALS = [
  { name: 'Demo User', email: 'demo@example.com', password: 'demo1234', role: 'user' as const },
  { name: 'Demo Admin', email: 'admin@example.com', password: 'admin1234', role: 'admin' as const },
]

/** Check if DEMO_MODE is enabled. */
export function isDemoMode(c: Context<AppEnv>): boolean {
  return c.env.DEMO_MODE === 'true'
}

/** Seed demo users if they don't exist (idempotent). */
export async function seedDemoUsers(c: Context<AppEnv>) {
  if (!isDemoMode(c)) return

  const auth = getAuth(c)
  const db = drizzle(c.env.DB)

  for (const cred of DEMO_CREDENTIALS) {
    try {
      // Check if user already exists
      const existing = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, cred.email)).get()
      if (existing) continue

      // Create via Better Auth API (proper password hashing)
      const result = await auth.api.signUpEmail({ body: { email: cred.email, password: cred.password, name: cred.name } })
      const userId = (result as any)?.user?.id
      if (!userId) {
        console.warn(`Demo seed: unexpected signup result for ${cred.email}`)
        continue
      }

      // Promote to admin if needed
      if (cred.role === 'admin') {
        await db.update(userTable).set({ role: 'admin' }).where(eq(userTable.id, userId)).run()
      }
      console.log(`Demo seed: created ${cred.role} ${cred.email}`)
    } catch (e: any) {
      // Ignore "already exists" errors (race condition safety)
      if (e?.message?.includes('UNIQUE constraint')) continue
      console.error(`Demo seed: failed for ${cred.email}:`, e?.message || e)
    }
  }
}

/** Return demo credentials for the login page (empty array when demo mode off). */
export function getPublicDemoCredentials(c: Context<AppEnv>) {
  if (!isDemoMode(c)) return []
  return DEMO_CREDENTIALS.map(({ name, email, password, role }) => ({ name, email, password, role }))
}
