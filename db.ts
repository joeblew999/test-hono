import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function initDB(path: string): Database {
  const db = new Database(path, { create: true })
  // Run migration files (same ones wrangler uses for D1)
  const migrationsDir = join(import.meta.dir, 'migrations')
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) {
    db.run(readFileSync(join(migrationsDir, file), 'utf-8'))
  }
  return db
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
            async all<T>(): Promise<D1Result<T>> {
              return { results: stmt.all(...params) as T[], success: true, meta: {} } as D1Result<T>
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
        async all<T>(): Promise<D1Result<T>> {
          return { results: stmt.all() as T[], success: true, meta: {} } as D1Result<T>
        },
        async run() {
          db.run(sql)
          return {} as D1Response
        },
      } as any
    },
  } as any
}
