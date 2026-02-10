import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { getAuth } from './auth'
import { userTable } from '../schema'
import { listTasks, createTask, updateTask } from './task-logic'
import { listNotes, createNote } from './note-logic'
import { getCount, setCount } from '../queries'
import { DEMO_CREDENTIALS, SEED_COUNTER_VALUE, USER_TASKS, ADMIN_TASKS } from '../sw/seed-data'

/** Demo notes — seeded per user on first visit. */
const SEED_NOTES = [
  'Welcome to the demo! Try the counter above \u2191',
  'Notes persist across sessions \u2014 close the tab and come back',
  'Add ?local to the URL for offline Service Worker mode',
  'Built with Hono + Datastar + Cloudflare Workers',
  'Delete me \u2014 or add your own notes below',
]

// Re-export for consumers that already import from demo.ts
export { DEMO_CREDENTIALS }

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


/** Seed demo data: counter, notes, tasks (idempotent, requires demo users to exist). */
export async function seedDemoData(c: Context<AppEnv>) {
  if (!isDemoMode(c)) return

  const db = c.env.DB
  const drizzleDb = drizzle(c.env.DB)

  // Counter: set to seed value if still at 0
  const count = await getCount(db)
  if (count === 0) {
    await setCount(db, SEED_COUNTER_VALUE)
    console.log(`Demo seed: counter set to ${SEED_COUNTER_VALUE}`)
  }

  // Notes + Tasks: seed for each demo user if they have zero items
  for (const cred of DEMO_CREDENTIALS) {
    const user = await drizzleDb.select({ id: userTable.id })
      .from(userTable).where(eq(userTable.email, cred.email)).get()
    if (!user) continue

    // Notes
    const existingNotes = await listNotes(drizzleDb, user.id)
    if (!existingNotes.length) {
      for (const text of SEED_NOTES) {
        await createNote(drizzleDb, user.id, { newNote: text })
      }
      console.log(`Demo seed: added ${SEED_NOTES.length} notes for ${cred.email}`)
    }

    // Tasks
    const existingTasks = await listTasks(drizzleDb, user.id)
    if (!existingTasks.length) {
      const seedTasks = cred.role === 'admin' ? ADMIN_TASKS : USER_TASKS
      for (const t of seedTasks) {
        const created = await createTask(drizzleDb, user.id, { taskTitle: t.title })
        if (t.status !== 'pending') {
          await updateTask(drizzleDb, user.id, created.id, { status: t.status })
        }
      }
      console.log(`Demo seed: added ${seedTasks.length} tasks for ${cred.email}`)
    }
  }
}

/** Return demo credentials for the login page (empty array when demo mode off). */
export function getPublicDemoCredentials(c: Context<AppEnv>) {
  if (!isDemoMode(c)) return []
  return DEMO_CREDENTIALS.map(({ name, email, password, role }) => ({ name, email, password, role }))
}
