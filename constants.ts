/**
 * Shared constants — API paths, DOM selectors, defaults.
 *
 * Zero framework imports so this can be bundled into the Service Worker
 * (browser target) as well as used in routes, tests, and configs.
 */

// ── API paths (full, with /api prefix) ──

export const API = {
  // Counter
  COUNTER: '/api/counter',
  COUNTER_INCREMENT: '/api/counter/increment',
  COUNTER_DECREMENT: '/api/counter/decrement',
  COUNTER_SET: '/api/counter/set',
  COUNTER_RESET: '/api/counter/reset',
  COUNTER_FRAGMENT: '/api/counter/fragment',
  // Notes
  NOTES: '/api/notes',
  NOTES_RESET: '/api/notes/reset',
  noteDelete: (id: number) => `/api/notes/${id}`,
  // Tasks
  TASKS: '/api/tasks',
  TASKS_RESET: '/api/tasks/reset',
  taskDelete: (id: number) => `/api/tasks/${id}`,
  taskUpdate: (id: number) => `/api/tasks/${id}`,
  // Local mode (SW only)
  LOCAL_STATUS: '/api/local/status',
  LOCAL_SYNC: '/api/local/sync',
  // Auth
  SESSION: '/api/session',
  AUTH_SIGNUP: '/api/auth/sign-up/email',
} as const

// ── DOM selectors (used in SSE fragment patching + tests) ──

export const SEL = {
  NOTES_LIST: '#notes-list',
  SERVER_FRAGMENT: '#server-fragment',
  TASK_LIST: '#task-list',
  TASK_COUNT: '#task-count-display',
} as const

// ── Default dev server URL ──

export const DEFAULT_BASE_URL = 'http://localhost:8787'
