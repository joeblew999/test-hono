// @ts-nocheck — This file is bundled for browser dedicated Worker, not Cloudflare Workers
/**
 * Dedicated Worker — holds wa-sqlite with OPFS persistence.
 * Spawned by the Leader tab's coordinator; only one instance runs across all tabs.
 * Uses AccessHandlePoolVFS (OPFS sync access handles) for fast I/O.
 */

import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import { Factory, SQLITE_ROW } from 'wa-sqlite'
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js'

import { COUNTER_TABLE_SQL, SEED_COUNTER_VALUE } from './seed-data'

type SQLiteAPI = ReturnType<typeof Factory>

let sqlite3: SQLiteAPI
let db: number

/** Execute SQL with optional params, return rows as objects */
async function exec(
  sql: string,
  params: any[] = [],
  mode: 'first' | 'all' | 'run' = 'all'
): Promise<{ rows: Record<string, any>[]; changes: number }> {
  const rows: Record<string, any>[] = []

  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params.length) {
      sqlite3.bind_collection(stmt, params)
    }

    if (mode === 'run') {
      await sqlite3.step(stmt)
    } else {
      while (await sqlite3.step(stmt) === SQLITE_ROW) {
        const columns = sqlite3.column_names(stmt)
        const values = sqlite3.row(stmt)
        const row: Record<string, any> = {}
        for (let i = 0; i < columns.length; i++) {
          row[columns[i]] = values[i]
        }
        rows.push(row)
        if (mode === 'first') break
      }
    }
  }

  return { rows, changes: sqlite3.changes(db) }
}

// ── Message handler ──

self.onmessage = async (e: MessageEvent) => {
  const { id, type, sql, params, mode } = e.data

  try {
    if (type === 'init') {
      // locateFile tells Emscripten where to find the WASM binary when bundled
      const module = await SQLiteESMFactory({
        locateFile: (file: string) => `/${file}`,
      })
      sqlite3 = Factory(module)

      // Register OPFS VFS
      const vfs = new AccessHandlePoolVFS('/wa-sqlite-local')
      await vfs.isReady
      sqlite3.vfs_register(vfs, true)

      // Open database on OPFS
      db = await sqlite3.open_v2('local.db')

      // Create tables + seed
      await sqlite3.exec(db, COUNTER_TABLE_SQL)
      await sqlite3.run(db, 'INSERT OR IGNORE INTO counter (id, value) VALUES (1, ?)', [SEED_COUNTER_VALUE])

      self.postMessage({ id, ok: true })
    } else if (type === 'exec') {
      const result = await exec(sql, params ?? [], mode ?? 'all')
      self.postMessage({ id, ok: true, rows: result.rows, changes: result.changes })
    } else {
      self.postMessage({ id, ok: false, error: `Unknown message type: ${type}` })
    }
  } catch (err: any) {
    self.postMessage({ id, ok: false, error: err.message ?? String(err) })
  }
}
