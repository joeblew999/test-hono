import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Context } from 'hono'
import type { AppEnv } from './types'
import { getAuth } from './auth'
import { userTable } from './schema'
import { listTasks, createTask, updateTask } from './task-logic'

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

const USER_TASKS = [
  { title: 'Try the counter — click + and −', status: 'completed' },
  { title: 'Add a new note in the Notes section', status: 'in_progress' },
  { title: 'Check out the API docs at /docs', status: 'pending' },
  { title: 'Test the MCP endpoint with an AI agent', status: 'pending' },
]

const ADMIN_TASKS = [
  { title: 'Review user signups in admin panel', status: 'in_progress' },
  { title: 'Deploy latest changes to production', status: 'completed' },
  { title: 'Set up monitoring alerts', status: 'pending' },
  { title: 'Update API documentation', status: 'completed' },
]

const SEED_NOTES = [
  'Welcome to the demo! Try the counter above ↑',
  'Notes persist in D1 (SQLite) on the server',
  'Add ?local to the URL for offline Service Worker mode',
  'Built with Hono + Datastar + Cloudflare Workers',
  'Delete me — or add your own notes below',
]

/** Seed demo data: counter, notes, tasks (idempotent, requires demo users to exist). */
export async function seedDemoData(c: Context<AppEnv>) {
  if (!isDemoMode(c)) return

  const db = c.env.DB
  const drizzleDb = drizzle(c.env.DB)

  // Counter: set to 42 if still at 0
  const count = await db.prepare('SELECT value FROM counter WHERE id = 1').first<{ value: number }>()
  if (count?.value === 0) {
    await db.prepare('UPDATE counter SET value = 42 WHERE id = 1').run()
    console.log('Demo seed: counter set to 42')
  }

  // Notes: seed if empty
  const { results: existingNotes } = await db.prepare('SELECT id FROM notes LIMIT 1').all()
  if (!existingNotes.length) {
    for (const text of SEED_NOTES) {
      await db.prepare('INSERT INTO notes (text) VALUES (?)').bind(text).run()
    }
    console.log(`Demo seed: added ${SEED_NOTES.length} notes`)
  }

  // Tasks: seed for each demo user if they have zero tasks
  for (const cred of DEMO_CREDENTIALS) {
    const user = await drizzleDb.select({ id: userTable.id })
      .from(userTable).where(eq(userTable.email, cred.email)).get()
    if (!user) continue

    const existing = await listTasks(drizzleDb, user.id)
    if (existing.length > 0) continue

    const seedTasks = cred.role === 'admin' ? ADMIN_TASKS : USER_TASKS
    for (const t of seedTasks) {
      const created = await createTask(drizzleDb, user.id, { title: t.title })
      if (t.status !== 'pending') {
        await updateTask(drizzleDb, user.id, created.id, { status: t.status })
      }
    }
    console.log(`Demo seed: added ${seedTasks.length} tasks for ${cred.email}`)
  }
}

/** Return demo credentials for the login page (empty array when demo mode off). */
export function getPublicDemoCredentials(c: Context<AppEnv>) {
  if (!isDemoMode(c)) return []
  return DEMO_CREDENTIALS.map(({ name, email, password, role }) => ({ name, email, password, role }))
}
