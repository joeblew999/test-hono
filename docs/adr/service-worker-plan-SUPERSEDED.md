# Hono Service Worker — Local-First Mode (SUPERSEDED)

## Status: SUPERSEDED — replaced by Leader Election + wa-sqlite + OPFS (see CLAUDE.md)

Datastar makes `@get('/api/counter')`, `@post('/api/notes')` etc. via `fetch()`. We register Hono as a **browser Service Worker** that intercepts these exact same fetch calls. Datastar thinks it's talking to a server, but everything runs locally in the browser — queries hit **sql.js** (SQLite WASM) instead of D1.

> **Note:** Original plan called for DuckDB WASM, but DuckDB requires a Web Worker thread (33 MB WASM). Service Workers cannot spawn Web Workers. sql.js (644 KB) is a direct SQLite WASM that works synchronously in the SW context and uses the exact same SQL dialect as D1 — zero query changes needed.

### What this gives us:

1. **Offline-first** — works without network
2. **Same codebase** — same Hono routes, same SQL queries, 3rd deployment target
3. **Zero Datastar changes** — Service Worker interception is transparent to `fetch()`
4. **Tiny footprint** — 644 KB WASM + 900 KB bundled JS

## How It Works

```
Browser                          Network
┌─────────────────────┐
│  Datastar            │
│  @get('/api/counter')│
│       │ fetch()      │
│       ▼              │
│  Service Worker      │         (no network needed)
│  ┌─────────────┐     │
│  │ Hono app    │     │
│  │ routes/*    │     │
│  │     │       │     │
│  │  sql.js     │     │
│  │  (SQLite)   │     │
│  └─────────────┘     │
└─────────────────────┘
```

## Architecture: 3rd Deployment Target

| | Workers (index.ts) | Bun (server.ts) | **Service Worker (sw.ts)** |
|---|---|---|---|
| Runtime | Cloudflare Workers | Bun | Browser |
| Database | D1 | bun:sqlite | sql.js (SQLite WASM) |
| SSE | One-shot | Persistent | One-shot |
| Auth | Better Auth + D1 | Better Auth + SQLite | None (Phase 1) |
| Entry | `export default app` | `Bun.serve(app)` | `handle(app)` |
| DB size | Remote | 0 (file) | In-memory |

## Key Technical Findings

### Hono Service Worker — Official Adapter
```typescript
import { Hono } from 'hono'
import { fire } from 'hono/service-worker'

const app = new Hono()
app.get('/api/hello', (c) => c.text('Hello'))
fire(app)  // registers fetch event listener
```
- `fire(app)` auto-registers `addEventListener('fetch', handle(app))`
- When Hono returns 404, the SW falls through to actual network (passthrough)
- This means `/api/*` routes are intercepted, static files pass through to CDN

### DuckDB WASM
- Package: `@duckdb/duckdb-wasm` (~3.2 MB compressed transfer)
- API: `db.connect()` → `conn.query(sql)` / `conn.prepare(sql).query(params)`
- Returns Apache Arrow format (needs conversion to plain objects)
- Runs in Worker/ServiceWorker context (confirmed Jan 2026)
- SQL dialect is identical to native DuckDB (same queries work on server + WASM)

### What's Already Compatible (No Changes Needed)
- **queries.ts** — Generic SQL (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `RETURNING`)
- **sse.ts** — One-shot SSE works in Service Workers (same as Cloudflare Workers mode)
- **schema.ts** — Pure Drizzle table definitions (generic SQLite schema)
- **routes/counter.ts, routes/notes.ts** — Route handlers are pure fetch→response
- **Datastar frontend** — `@get`/`@post`/`@delete` use `fetch()`, transparently intercepted

### What Needs a New Adapter
- **db.ts** → new `duckdb-adapter.ts` implementing D1Database interface
- **Entry point** → new `sw.ts` using `fire(app)` instead of `export default app`
- **Registration** → `index.html` needs `navigator.serviceWorker.register('/sw.js')`

## Files to Create/Modify

| File | Action |
|------|--------|
| `sw.ts` | **NEW** — Service Worker entry point: init DuckDB WASM, `fire(app)` |
| `duckdb-adapter.ts` | **NEW** — DuckDB WASM → D1Database interface adapter |
| `sw-api.ts` | **NEW** — Slimmed route composer (counter + notes, no auth/tasks initially) |
| `static/index.html` | Add Service Worker registration script |
| `package.json` | Add `@duckdb/duckdb-wasm` dependency |
| `Taskfile.yml` | Add `sw:build` command (bundle sw.ts for browser) |

## Step 1: DuckDB WASM → D1 Adapter (`duckdb-adapter.ts`)

Same pattern as existing `db.ts` (bun:sqlite → D1), but for DuckDB WASM:

```typescript
import * as duckdb from '@duckdb/duckdb-wasm'

export async function initDuckDB(): Promise<duckdb.AsyncDuckDBConnection> {
  const bundle = await duckdb.selectBundle(/* bundles */)
  const worker = new Worker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule)
  return db.connect()
}

export function createD1Compat(conn: duckdb.AsyncDuckDBConnection): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: any[]) {
          return {
            async first<T>() {
              const result = await conn.query(sql, params)
              return result.toArray()[0] as T ?? null
            },
            async all<T>() {
              const result = await conn.query(sql, params)
              return { results: result.toArray() as T[], success: true, meta: {} }
            },
            async run() {
              await conn.query(sql, params)
              return {} as D1Response
            },
          }
        },
        // ... no-param versions (same but without params)
      }
    }
  }
}
```

## Step 2: Service Worker Entry Point (`sw.ts`)

```typescript
import { Hono } from 'hono'
import { fire } from 'hono/service-worker'
import { initDuckDB, createD1Compat } from './duckdb-adapter'
import swApi from './sw-api'

const app = new Hono()
let db: D1Database

// Init DuckDB on Service Worker install
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    initDuckDB().then(async (conn) => {
      db = createD1Compat(conn)
      // Run migrations
      await conn.query(`CREATE TABLE IF NOT EXISTS counter ...`)
      await conn.query(`CREATE TABLE IF NOT EXISTS notes ...`)
    })
  )
})

// Inject DB into env for each request
app.use('/api/*', async (c, next) => {
  (c.env as any).DB = db
  await next()
})

// Mount API routes (counter + notes — no auth in SW mode)
app.route('/api', swApi())

fire(app)  // intercept fetch events
```

## Step 3: SW Route Composer (`sw-api.ts`)

Slim version of `api.ts` — just counter + notes (no auth, no tasks, no MCP):

```typescript
import counterRoutes from './routes/counter'
import notesRoutes from './routes/notes'

export default () => {
  const app = new OpenAPIHono()
  app.route('/', counterRoutes())
  app.route('/', notesRoutes())
  return app
}
```

## Step 4: Service Worker Registration (`static/index.html`)

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW failed:', err))
  }
</script>
```

## Step 5: Build Pipeline

```yaml
# Taskfile.yml
sw:build:
  desc: "Bundle Service Worker with DuckDB WASM"
  cmds:
    - bun build sw.ts --outdir static --outfile sw.js --target browser
```

## What's NOT in Scope (Phase 1)

- **Auth/Tasks** — Skip Better Auth in SW mode (requires server-side sessions)
- **Persistent SSE** — Not possible in Service Workers (same as Cloudflare Workers)
- **Data sync** — DuckDB ↔ server sync is a future phase
- **Drizzle ORM in SW** — Use raw SQL via `queries.ts` only

## Phase 2 (Future)

- **Server-side DuckDB** — Replace bun:sqlite with native DuckDB in `server.ts`
- **Sync protocol** — DuckDB ATTACH or custom changeset sync between SW ↔ server
- **Offline indicator** — Datastar signal showing online/offline status
- **Auth in SW** — Lightweight session handling without Better Auth

## DuckDB SQL Compatibility Notes

| queries.ts Pattern | DuckDB Support |
|---|---|
| `UPDATE ... SET value = value + 1 RETURNING value` | Yes |
| `INSERT INTO ... RETURNING id, text, created_at` | Yes |
| `datetime('now')` | Yes (SQLite compat mode) |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | Yes |
| Positional `?` params | Yes |
