# Claude Code Project Instructions

## Architecture

- **index.ts** — Cloudflare Workers entry point (auth handler, API routes, MCP endpoint)
- **server.ts** — Bun/Fly.io entry point (persistent SSE with broadcast, auth, MCP)
- **api.ts** — Route composer: imports from routes/, accepts optional BroadcastConfig
- **routes/counter.ts** — Counter schemas, OpenAPI routes, handlers (public)
- **routes/notes.ts** — Notes CRUD schemas, OpenAPI routes, handlers (public)
- **routes/tasks.ts** — Tasks CRUD OpenAPI routes with auth middleware (protected)
- **schema.ts** — Drizzle ORM table definitions (auth + tasks) — pure, no Zod/OpenAPI
- **validators.ts** — Zod validation schemas with `.openapi()` — shared by routes/* and mcp.ts
- **auth.ts** — Better Auth factory with admin plugin, `requireAuth` + `requireAdmin` middleware
- **mcp.ts** — MCP server factory: `createMcpServer(ctx)` with 15 tools (counter, notes, tasks, admin)
- **task-logic.ts** — Pure task CRUD business logic (Drizzle, no framework coupling)
- **sse.ts** — SSE helpers: isSSE, respond, respondFragment, respondPersistent
- **types.ts** — Shared types: AppEnv (with auth bindings + variables), BroadcastConfig
- **queries.ts** — Raw D1 SQL queries (counter + notes only)
- **db.ts** — bun:sqlite → D1 adapter (Bun mode only)
- **docs.ts** — OpenAPI doc + Scalar mount helper
- **static/index.html** — Datastar showcase with auth + tasks UI
- **static/datastar.js** — Self-hosted Datastar v1 RC.7 bundle (+ .map)

## Dual-Binding Pattern (Core Architecture)

Zod schemas defined ONCE in `validators.ts` power both:
1. **OpenAPI routes** in `routes/tasks.ts` via `createRoute({ request: { body: { schema: CreateTaskSchema } } })`
2. **MCP tools** in `mcp.ts` via `mcp.tool('tasks_create', CreateTaskSchema.shape, handler)`

Business logic in `task-logic.ts` is called identically from both paths.

## Authentication (Better Auth)

- **Auth handler**: Mounted at `/api/auth/*` in both entry points
- **Email+password**: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`
- **Session middleware**: `routes/tasks.ts` checks session via `getAuth(c).api.getSession()`
- **MCP auth gate**: `/mcp` endpoint validates session before creating MCP server
- **Per-request factory**: `getAuth(c)` needed because D1 is only available in request context
- **Critical**: Date columns use `integer` mode `timestamp` — D1 cannot bind Date objects to TEXT
- **Critical**: `nodejs_compat` flag required in wrangler.toml (Better Auth uses node:async_hooks)

## MCP Protocol

- **Transport**: Streamable HTTP via `@hono/mcp` `StreamableHTTPTransport` (SSE is deprecated)
- **Endpoint**: `POST/GET /mcp` — authenticated, per-request MCP server
- **13 tools**: counter_get/increment/decrement/set/reset, notes_list/add/delete, tasks_list/create/get/update/delete
- **Context injection**: D1 + Drizzle + userId passed via closure to `createMcpServer()`
- **Connect**: `npx @modelcontextprotocol/inspector http://localhost:8787/mcp` (with auth header)

## Content Negotiation Pattern

Single set of OpenAPI routes serves both JSON and SSE:
- `isSSE(c)` checks `Accept: text/event-stream` header
- `respond(c, data)` → patches signals via `datastar-patch-signals` or returns JSON
- `respondFragment(c, data)` → patches signals AND DOM via `datastar-patch-elements`
- No duplicate routes — Datastar frontend hits same URLs as REST API

## Dual-Mode Deployment

- **Workers** (`index.ts`): D1, one-shot SSE, `api()` with no broadcast
- **Fly.io** (`server.ts`): bun:sqlite, persistent SSE, `api(broadcastConfig)`
- `db.ts` adapter wraps bun:sqlite to match D1Database interface
- Same routes, same frontend, same 15 tests on both platforms

## Database

- **Counter + Notes**: Raw D1 SQL in `queries.ts` (simple, no ORM needed)
- **Auth + Tasks**: Drizzle ORM with `drizzle-orm/d1` driver
- **Migrations**: `task db:generate` creates SQL via drizzle-kit, wrangler applies them
- **Drizzle output**: `drizzle/` dir (drizzle-kit managed), `migrations/` dir (wrangler-managed)
- **Date columns**: `INTEGER NOT NULL DEFAULT (unixepoch())` — Drizzle `timestamp` mode handles Date ↔ int
- **Schema split**: `schema.ts` is pure Drizzle (drizzle-kit reads it), `validators.ts` has Zod+OpenAPI (drizzle-kit never sees it)

## Datastar v1 (RC.7) — Self-Hosted

**Important:** RC.7 is a GitHub release, NOT on npm. We self-host `static/datastar.js`.

### Working Attributes
- `data-signals`, `data-text`, `data-on:click`, `data-init`, `data-class`, `data-show`
- `data-computed` (name MUST be lowercase), `data-bind`, `data-attr`, `data-effect`
- `data-style`, `data-json-signals`, `data-on:keydown.window`, `data-on:input.debounce`
- Actions: `@get`, `@post`, `@delete`, `@patch`

### Things That DON'T Work (RC.7)
- `data-on:submit.prevent` — form submits normally → use `data-on:click` on button
- `data-on-intersect` — doesn't fire in headless Playwright → use `data-init`
- `data-on-interval` — expression never executes → use `data-init="setInterval(...)"`
- `evt.target.value` — undefined → use `$evt.target.value` ($ prefix required)
- Fragment `prepend`/`outer` multi-ops — unreliable → use single `inner` mode

### SSE Events
- `datastar-patch-signals` — data: `signals {"key": value}`
- `datastar-patch-elements` — data: `selector #id` / `mode inner` / `elements <html>`
- Use `inner` mode exclusively for list re-renders (most reliable with Idiomorph)
- Element IDs are VITAL for Idiomorph morphing — always use `id="item-${id}"`

## Testing

- 21 Playwright e2e tests (9 counter + 6 notes/demo + 6 auth)
- `task test` — headed + serial (real browser, ~12s, zero race conditions)
- `task test:ci` — headless + parallel (fast, ~4s, for CI)
- `task screenshots` — headed capture to docs/screenshots/
- `pressSequentially` not `fill` for `data-bind` inputs
- Text-based locators (`{ hasText: 'X' }`) for Idiomorph-morphed lists

## Commands

- `task dev` — start Workers dev server with logs (port 8787)
- `task fly:dev` — start Bun server (port 3000, persistent SSE)
- `task test` — run 21 e2e tests headed + serial
- `task test:ci` — run 21 e2e tests headless + parallel
- `task db:generate` — generate SQL migration from schema.ts changes (drizzle-kit)
- `task db:studio` — open Drizzle Studio (browser DB explorer)
- `task deploy` — deploy to Cloudflare Workers (runs remote D1 migrations)
- `task fly:deploy` — deploy to Fly.io
- `task screenshots` — capture headed screenshots to docs/screenshots/

## Environment Variables

- `BETTER_AUTH_SECRET` — Auth encryption secret (set via `wrangler secret put` / `fly secrets set`)
- `BETTER_AUTH_URL` — Base URL for auth callbacks (e.g. `http://localhost:8787`)
- `SYNC_API_KEY` — Bearer token for `/api/sync/*` (Fly.io only)
- `DB_PATH` — SQLite file path (Bun mode only)
- `USE_CORROSION_DB` — Enable Corrosion sync (Fly.io only)
