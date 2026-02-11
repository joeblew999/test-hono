// @ts-nocheck — This file is bundled for the browser, not Cloudflare Workers
/**
 * Leader Election coordinator for cross-tab wa-sqlite access.
 *
 * Uses Web Locks API for leader election:
 * - Leader tab: spawns dedicated Worker (wa-sqlite + OPFS), handles queries from Followers
 * - Follower tab: proxies queries via BroadcastChannel to Leader
 * - Lock auto-releases when Leader tab closes; Follower reloads to re-elect
 *
 * Both roles export the same D1Database interface — callers don't need to know the role.
 */

const LOCK_NAME = 'wa-sqlite-leader'
const CHANNEL_NAME = 'wa-sqlite-db'
const QUERY_TIMEOUT = 5000

export interface CoordinatorResult {
  db: D1Database
  role: 'leader' | 'follower'
  getMutationCount: () => number
  resetMutationCount: () => void
}

// ── BroadcastChannel message types ──

interface DbQuery {
  type: 'db-query'
  tabId: string
  id: number
  sql: string
  params: any[]
  mode: 'first' | 'all' | 'run'
}

interface DbResult {
  type: 'db-result'
  tabId: string
  id: number
  ok: boolean
  rows?: Record<string, any>[]
  changes?: number
  error?: string
}

// ── Helpers ──

function isMutation(sql: string): boolean {
  const s = sql.trimStart().toUpperCase()
  return s.startsWith('UPDATE') || s.startsWith('INSERT') || s.startsWith('DELETE')
}

// ── D1Database factory (shared by Leader and Follower) ──

function createD1(
  execSQL: (sql: string, params: any[], mode: string) => Promise<{ rows: any[]; changes: number }>,
  onMutation: () => void,
): D1Database {
  function makeStmt(sql: string, params: any[]) {
    const mutates = isMutation(sql)

    async function doExec(mode: string) {
      const result = await execSQL(sql, params, mode)
      if (mutates) onMutation()
      return result
    }

    return {
      bind(...bindParams: any[]) {
        return makeStmt(sql, bindParams)
      },
      async first<T>(): Promise<T | null> {
        const { rows } = await doExec('first')
        return (rows[0] as T) ?? null
      },
      async all<T>(): Promise<D1Result<T>> {
        const { rows } = await doExec('all')
        return { results: rows as T[], success: true, meta: {} } as D1Result<T>
      },
      async run() {
        await doExec('run')
        return {} as D1Response
      },
    }
  }

  return { prepare: (sql: string) => makeStmt(sql, []) } as any
}

// ── Leader implementation ──

async function initLeader(): Promise<CoordinatorResult> {
  const worker = new Worker('/db-worker.js', { type: 'module' })

  // ID-correlation for worker messages
  let nextId = 0
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()

  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, rows, changes, error } = e.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (ok) p.resolve({ rows: rows ?? [], changes: changes ?? 0 })
    else p.reject(new Error(error ?? 'Worker error'))
  }

  // Surface worker load errors (syntax errors, import failures, etc.)
  worker.onerror = (e) => {
    const err = new Error(`Worker error: ${e.message}`)
    for (const [, p] of pending) p.reject(err)
    pending.clear()
  }

  function send(msg: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      worker.postMessage({ ...msg, id })
    })
  }

  // Initialize wa-sqlite in the worker
  await send({ type: 'init' })

  // SQL execution via worker
  function execSQL(sql: string, params: any[], mode: string) {
    return send({ type: 'exec', sql, params, mode })
  }

  // Mutation tracking
  let mutationCount = 0

  // Listen for Follower queries on BroadcastChannel
  const bc = new BroadcastChannel(CHANNEL_NAME)
  bc.onmessage = async (e: MessageEvent) => {
    const msg = e.data as DbQuery
    if (msg.type !== 'db-query') return

    try {
      const result = await execSQL(msg.sql, msg.params, msg.mode)
      bc.postMessage({
        type: 'db-result',
        tabId: msg.tabId,
        id: msg.id,
        ok: true,
        rows: result.rows,
        changes: result.changes,
      } as DbResult)
    } catch (err: any) {
      bc.postMessage({
        type: 'db-result',
        tabId: msg.tabId,
        id: msg.id,
        ok: false,
        error: err.message ?? String(err),
      } as DbResult)
    }
  }

  return {
    db: createD1(execSQL, () => { mutationCount++ }),
    role: 'leader',
    getMutationCount: () => mutationCount,
    resetMutationCount: () => { mutationCount = 0 },
  }
}

// ── Follower implementation ──

async function initFollower(): Promise<CoordinatorResult> {
  const tabId = crypto.randomUUID()
  const bc = new BroadcastChannel(CHANNEL_NAME)
  let nextId = 0
  let mutationCount = 0
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()

  bc.onmessage = (e: MessageEvent) => {
    const msg = e.data as DbResult
    if (msg.type !== 'db-result' || msg.tabId !== tabId) return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    clearTimeout(p.timer)
    if (msg.ok) p.resolve({ rows: msg.rows ?? [], changes: msg.changes ?? 0 })
    else p.reject(new Error(msg.error ?? 'Leader error'))
  }

  function execSQL(sql: string, params: any[], mode: string): Promise<{ rows: any[]; changes: number }> {
    return new Promise((resolve, reject) => {
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('Leader timeout'))
        // Leader likely died — reload to re-elect
        location.reload()
      }, QUERY_TIMEOUT)
      pending.set(id, { resolve, reject, timer })
      bc.postMessage({ type: 'db-query', tabId, id, sql, params, mode } as DbQuery)
    })
  }

  return {
    db: createD1(execSQL, () => { mutationCount++ }),
    role: 'follower',
    getMutationCount: () => mutationCount,
    resetMutationCount: () => { mutationCount = 0 },
  }
}

// ── Public API ──

export async function initCoordinator(): Promise<CoordinatorResult> {
  // Try to acquire the leader lock (non-blocking)
  const role = await new Promise<'leader' | 'follower'>((resolve) => {
    navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve('follower')
        return // no lock held
      }
      resolve('leader')
      // Hold the lock forever (until tab closes) by returning a never-resolving Promise
      return new Promise<void>(() => {})
    })
  })

  console.log(`[local-mode] Elected as ${role}`)
  return role === 'leader' ? initLeader() : initFollower()
}
