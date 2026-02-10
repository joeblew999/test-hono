/**
 * Shared constants — single source of truth for demo mode + table schemas.
 *
 * Zero framework imports so this can be bundled into the Service Worker
 * (browser target) as well as used server-side in demo.ts.
 */

// ── Table schemas (must match migrations/0001_init.sql and 0002_notes.sql) ──

export const COUNTER_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    value INTEGER NOT NULL DEFAULT 0
  )`

// ── Seed data ──

/** Counter starts at 42 in demo mode. */
export const SEED_COUNTER_VALUE = 42

/** Demo user credentials — intentionally public, for try-before-you-sign-up. */
export const DEMO_CREDENTIALS = [
  { name: 'Demo User', email: 'demo@example.com', password: 'demo1234', role: 'user' as const },
  { name: 'Demo Admin', email: 'admin@example.com', password: 'admin1234', role: 'admin' as const },
]

/** Demo tasks per role. */
export const USER_TASKS = [
  { title: 'Try the counter \u2014 click + and \u2212', status: 'completed' },
  { title: 'Add a new note in the Notes section', status: 'in_progress' },
  { title: 'Check out the API docs at /docs', status: 'pending' },
  { title: 'Test the MCP endpoint with an AI agent', status: 'pending' },
]

export const ADMIN_TASKS = [
  { title: 'Review user signups in admin panel', status: 'in_progress' },
  { title: 'Deploy latest changes to production', status: 'completed' },
  { title: 'Set up monitoring alerts', status: 'pending' },
  { title: 'Update API documentation', status: 'completed' },
]
