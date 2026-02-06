import { Database } from 'bun:sqlite'

let database: Database

export function initDB(path: string): Database {
  database = new Database(path, { create: true })
  database.run('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL DEFAULT 0)')
  database.run('INSERT OR IGNORE INTO counter (id, value) VALUES (1, 0)')
  return database
}

export function getDB(): Database {
  return database
}

// Makes bun:sqlite look like Cloudflare D1Database so queries.ts works unchanged
export function createD1Compat(db: Database): D1Database {
  return {
    prepare(sql: string) {
      const stmt = db.query(sql)
      return {
        bind(...params: any[]) {
          return {
            async first<T>(): Promise<T | null> {
              return stmt.get(...params) as T | null
            },
            async run() {
              db.run(sql, ...params)
              return {} as D1Response
            },
          }
        },
        async first<T>(): Promise<T | null> {
          return stmt.get() as T | null
        },
        async run() {
          db.run(sql)
          return {} as D1Response
        },
      } as any
    },
  } as any
}
