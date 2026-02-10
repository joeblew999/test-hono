// @ts-ignore — sql.js has no type declarations
import initSqlJs from 'sql.js'
import { COUNTER_TABLE_SQL, NOTES_TABLE_SQL, SEED_COUNTER_VALUE, SEED_NOTES } from './seed-data'

// IndexedDB constants for persistence
const IDB_NAME = 'sw-sqljs'
const IDB_STORE = 'db'
const IDB_KEY = 'main'

/** Save sql.js database bytes to IndexedDB */
async function saveToIDB(db: any): Promise<void> {
  const data = db.export() // Uint8Array
  const req = indexedDB.open(IDB_NAME, 1)
  return new Promise((resolve, reject) => {
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE) }
    req.onsuccess = () => {
      const tx = req.result.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(data, IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Load sql.js database bytes from IndexedDB (returns null if none saved) */
async function loadFromIDB(): Promise<Uint8Array | null> {
  const req = indexedDB.open(IDB_NAME, 1)
  return new Promise((resolve, reject) => {
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE) }
    req.onsuccess = () => {
      const tx = req.result.transaction(IDB_STORE, 'readonly')
      const getReq = tx.objectStore(IDB_STORE).get(IDB_KEY)
      getReq.onsuccess = () => resolve(getReq.result ?? null)
      getReq.onerror = () => reject(getReq.error)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Check if SQL statement is a mutation (INSERT/UPDATE/DELETE) */
function isMutation(sql: string): boolean {
  const s = sql.trimStart().toUpperCase()
  return s.startsWith('UPDATE') || s.startsWith('INSERT') || s.startsWith('DELETE')
}

/** Mutation counter — tracks user changes since last sync */
let mutationCount = 0
export function getMutationCount(): number { return mutationCount }
export function resetMutationCount(): void { mutationCount = 0 }

/** Initialize sql.js and create/restore a SQLite database with IndexedDB persistence */
export async function initSqlJsDB(wasmUrl: string): Promise<any> {
  const wasmBinary = await fetch(wasmUrl).then(r => r.arrayBuffer())
  const SQL = await initSqlJs({ wasmBinary })

  // Try to restore from IndexedDB
  const saved = await loadFromIDB()
  if (saved) {
    console.log('SW: restored DB from IndexedDB')
    return new SQL.Database(saved)
  }

  // Fresh DB: create tables + seed data
  const db = new SQL.Database()

  db.run(COUNTER_TABLE_SQL)
  db.run('INSERT OR IGNORE INTO counter (id, value) VALUES (1, ?)', [SEED_COUNTER_VALUE])

  db.run(NOTES_TABLE_SQL)

  for (const text of SEED_NOTES) {
    db.run('INSERT INTO notes (text) VALUES (?)', [text])
  }

  await saveToIDB(db)
  console.log(`SW: created fresh DB with seed data (counter=${SEED_COUNTER_VALUE}, ${SEED_NOTES.length} notes)`)
  return db
}

/** Wrap sql.js Database to match D1Database interface so queries.ts works unchanged */
export function createD1Compat(db: any): D1Database {
  return {
    prepare(sql: string) {
      const mutates = isMutation(sql)

      function exec(params?: any[]) {
        const stmt = db.prepare(sql)
        if (params?.length) stmt.bind(params)

        // Collect results as plain objects
        const rows: any[] = []
        while (stmt.step()) {
          rows.push(stmt.getAsObject())
        }
        stmt.free()
        return rows
      }

      return {
        bind(...params: any[]) {
          return {
            async first<T>(): Promise<T | null> {
              const rows = exec(params)
              if (mutates) { mutationCount++; await saveToIDB(db) }
              return (rows[0] as T) ?? null
            },
            async all<T>(): Promise<D1Result<T>> {
              const rows = exec(params)
              if (mutates) { mutationCount++; await saveToIDB(db) }
              return { results: rows as T[], success: true, meta: {} } as D1Result<T>
            },
            async run() {
              exec(params)
              if (mutates) { mutationCount++; await saveToIDB(db) }
              return {} as D1Response
            },
          }
        },
        async first<T>(): Promise<T | null> {
          const rows = exec()
          if (mutates) { mutationCount++; await saveToIDB(db) }
          return (rows[0] as T) ?? null
        },
        async all<T>(): Promise<D1Result<T>> {
          const rows = exec()
          if (mutates) { mutationCount++; await saveToIDB(db) }
          return { results: rows as T[], success: true, meta: {} } as D1Result<T>
        },
        async run() {
          exec()
          if (mutates) { mutationCount++; await saveToIDB(db) }
          return {} as D1Response
        },
      } as any
    },
  } as any
}
