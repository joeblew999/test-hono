// @ts-ignore — sql.js has no type declarations
import initSqlJs from 'sql.js'

/** Initialize sql.js and create an in-memory SQLite database */
export async function initSqlJsDB(wasmUrl: string): Promise<any> {
  const wasmBinary = await fetch(wasmUrl).then(r => r.arrayBuffer())
  const SQL = await initSqlJs({ wasmBinary })
  const db = new SQL.Database()

  // Run counter + notes migrations (same schema as D1)
  db.run(`
    CREATE TABLE IF NOT EXISTS counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      value INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.run('INSERT OR IGNORE INTO counter (id, value) VALUES (1, 0)')
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  return db
}

/** Wrap sql.js Database to match D1Database interface so queries.ts works unchanged */
export function createD1Compat(db: any): D1Database {
  return {
    prepare(sql: string) {
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
              return (rows[0] as T) ?? null
            },
            async all<T>(): Promise<D1Result<T>> {
              const rows = exec(params)
              return { results: rows as T[], success: true, meta: {} } as D1Result<T>
            },
            async run() {
              exec(params)
              return {} as D1Response
            },
          }
        },
        async first<T>(): Promise<T | null> {
          const rows = exec()
          return (rows[0] as T) ?? null
        },
        async all<T>(): Promise<D1Result<T>> {
          const rows = exec()
          return { results: rows as T[], success: true, meta: {} } as D1Result<T>
        },
        async run() {
          exec()
          return {} as D1Response
        },
      } as any
    },
  } as any
}
