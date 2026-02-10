# Claude Code Project Instructions

## Architecture

### Root (entry points + shared foundations)
- **index.ts** — Cloudflare Workers entry point (auth handler, API routes, MCP endpoint)
- **server.ts** — Bun/Fly.io entry point (persistent SSE with broadcast, auth, MCP)
- **api.ts** — Route composer: imports from routes/, accepts optional BroadcastConfig
- **types.ts** — Shared types: AppEnv (with auth bindings + variables), BroadcastConfig
- **constants.ts** — API paths, DOM selectors, default base URL
- **schema.ts** — Drizzle ORM table definitions (auth + tasks + notes) — pure, no Zod/OpenAPI
- **validators.ts** — Zod validation schemas with `.openapi()` — shared by routes/* and lib/mcp/
- **queries.ts** — Raw D1 SQL queries (counter only)
- **sse.ts** — SSE helpers: isSSE, respond, respondFragment, respondPersistent, respondPersistentPolling, respondPersistentPollingFragments

### lib/ (application logic)
- **lib/auth.ts** — Better Auth factory with admin + multiSession plugins, `requireAuth` + `requireAdmin` middleware
- **lib/crud.ts** — Generic CRUD factory: `createCrud({ table, orderBy? })` → `{ list, create, get, update, del, clear }` (user-scoped)
- **lib/route-helpers.ts** — `respondAfterMutation()` — re-render list + SSE/JSON branch + broadcast after mutations
- **lib/session-logic.ts** — UA parsing (parseBrowser/parseOS) + session rendering helpers
- **lib/note-logic.ts** — Pure note CRUD business logic (thin wrapper over crud.ts)
- **lib/task-logic.ts** — Pure task CRUD business logic (thin wrapper over crud.ts)
- **lib/demo.ts** — Demo mode: seed users, data, and public credentials
- **lib/docs.ts** — OpenAPI doc + Scalar mount helper
- **lib/middleware.ts** — Global error handler, structured 404, security headers
- **lib/mcp/** — MCP server plugin directory (see below)

### db/ (database adapters)
- **db/bun.ts** — bun:sqlite → D1 adapter (Bun mode only)

### sw/ (Service Worker)
- **sw/index.ts** — Service Worker entry point (local-first with sql.js, opt-in via `?local`)
- **sw/api.ts** — Slim route composer for SW (counter only, no auth/notes/tasks/MCP)
- **sw/sqljs-adapter.ts** — sql.js → D1Database interface adapter (browser)
- **sw/seed-data.ts** — Seed data constants (shared by SW and demo.ts)

### lib/mcp/ (MCP server plugins)
- **lib/mcp/index.ts** — `handleMcpRequest()` + `createMcpServer()` orchestrator
- **lib/mcp/types.ts** — `McpContext` type + `jsonResult`/`errorResult` helpers
- **lib/mcp/counter.ts** — `addCounterTools(mcp, ctx)` — 5 counter tools
- **lib/mcp/notes.ts** — `addNotesTools(mcp, ctx)` — 3 notes tools
- **lib/mcp/tasks.ts** — `addTasksTools(mcp, ctx)` — 5 tasks tools
- **lib/mcp/sessions.ts** — `addSessionsTools(mcp, ctx)` — 3 sessions tools
- **lib/mcp/admin.ts** — `addAdminTools(mcp, ctx)` — 2 admin tools

### routes/ (OpenAPI route handlers)
- **routes/counter.ts** — Counter schemas, OpenAPI routes, handlers (public)
- **routes/notes.ts** — Notes CRUD OpenAPI routes with auth middleware (protected)
- **routes/tasks.ts** — Tasks CRUD OpenAPI routes with auth middleware (protected)
- **routes/sessions.ts** — Session listing + revocation OpenAPI routes with SSE polling (protected)

### static/
- **static/index.html** — Datastar showcase with auth + tasks + sessions UI
- **static/datastar.js** — Self-hosted Datastar v1 RC.7 bundle (+ .map)

## Dual-Binding Pattern (Core Architecture)

Zod schemas defined ONCE in `validators.ts` power both:
1. **OpenAPI routes** in `routes/tasks.ts` via `createRoute({ request: { body: { schema: CreateTaskSchema } } })`
2. **MCP tools** in `lib/mcp/tasks.ts` via `mcp.tool('tasks_create', CreateTaskSchema.shape, handler)`

Business logic in `task-logic.ts` / `note-logic.ts` is called identically from both paths.

## Authentication (Better Auth)

- **Auth handler**: Mounted at `/api/auth/*` in both entry points
- **Email+password**: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`
- **Session middleware**: `routes/tasks.ts` checks session via `getAuth(c).api.getSession()`
- **Multi-session plugin**: `multiSession({ maximumSessions: 10 })` — list/revoke device sessions
- **Session endpoints**: `GET /api/auth/multi-session/list-device-sessions`, `POST .../revoke`
- **MCP auth gate**: `/mcp` endpoint validates session before creating MCP server
- **Per-request factory**: `getAuth(c)` needed because D1 is only available in request context
- **Critical**: Date columns use `integer` mode `timestamp` — D1 cannot bind Date objects to TEXT
- **Critical**: `nodejs_compat` flag required in wrangler.toml (Better Auth uses node:async_hooks)

## MCP Protocol

- **Transport**: Streamable HTTP via `@hono/mcp` `StreamableHTTPTransport` (SSE is deprecated)
- **Endpoint**: `POST/GET /mcp` — authenticated, per-request MCP server
- **18 tools**: counter(5), notes(3), tasks(5), sessions(3), admin(2) — split into `lib/mcp/*.ts` plugins
- **Context injection**: D1 + Drizzle + userId passed via `McpContext` to each plugin's `addXxxTools(mcp, ctx)`
- **Adding tools**: Create `lib/mcp/newdomain.ts` with `addNewDomainTools(mcp, ctx)`, register in `lib/mcp/index.ts`
- **Connect**: `npx @modelcontextprotocol/inspector http://localhost:8787/mcp` (with auth header)

## Content Negotiation Pattern

Single set of OpenAPI routes serves both JSON and SSE:
- `isSSE(c)` checks `Accept: text/event-stream` header
- `respond(c, data)` → patches signals via `datastar-patch-signals` or returns JSON
- `respondFragment(c, data)` → patches signals AND DOM via `datastar-patch-elements`
- `respondAfterMutation()` — generic helper: re-fetch list → render → SSE/JSON + broadcast (used by all mutation handlers)
- No duplicate routes — Datastar frontend hits same URLs as REST API

## Tri-Mode Deployment

- **Workers** (`index.ts`): D1, persistent SSE via D1 polling (counter), `api()` with no broadcast
- **Fly.io** (`server.ts`): bun:sqlite, persistent SSE, `api(broadcastConfig)`
- **Service Worker** (`sw/index.ts`): sql.js (SQLite WASM), local-first, opt-in via `?local` query param
- `db/bun.ts` adapter wraps bun:sqlite to match D1Database interface
- `sw/sqljs-adapter.ts` wraps sql.js to match D1Database interface (browser)
- `sw/api.ts` — slim route composer (counter only, no auth/notes/tasks/MCP)
- Same routes, same frontend, same 23 tests on all platforms

## Database

- **Counter**: Raw D1 SQL in `queries.ts` (singleton row, no ORM needed)
- **Auth + Tasks + Notes**: Drizzle ORM with `drizzle-orm/d1` driver (all user-scoped)
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

## Persistent SSE on Workers (D1 Polling)

Workers can't share I/O between requests, so persistent SSE uses D1 polling (no Durable Objects, no WebSockets):
- `respondPersistentPolling(c, signals)` — polls counter every 2s, sends signals when changed
- `respondPersistentPollingFragments(c, initial, poll)` — same but also re-renders HTML fragments
- Heartbeat every 30s prevents Cloudflare 524 timeout (100s idle limit)
- `stream.onAbort()` kills polling loop when client disconnects (no zombie workers)
- Fly.io uses push-based broadcast (in-memory `Set<Listener>`), Workers uses poll-based D1 reads

## Testing

- 29 Playwright e2e tests (9 counter + 6 notes/demo + 6 auth + 4 sessions + 4 service worker)
- 1 sync-demo test (two-tab cross-tab live sync, video-only)
- 4 screenshot tests (3 viewports × 4 screenshots)
- `task test` — headed + serial (real browser, ~30s)
- `task test:ci` — headless + parallel (fast, for CI)
- `task docs` — generate all doc assets (screenshots + videos + sync demo)
- `task videos` — 25 per-test GIFs (flat files, clean names)
- `task sync-demo` — two-tab side-by-side sync demo GIF
- `task screenshots` — responsive screenshots at 3 viewports
- `pressSequentially` not `fill` for `data-bind` inputs
- Text-based locators (`{ hasText: 'X' }`) for Idiomorph-morphed lists
- `tests/fixtures.ts` — shared `signUpViaLoginPage` / `signInViaLoginPage` helpers (used by auth, notes, sessions tests)

### Playwright Configs
- `playwright.config.ts` — main test suite (25 tests, excludes screenshots + sync-demo)
- `playwright.videos.ts` — video recording of all 25 tests → `docs/videos/*.gif`
- `playwright.screenshots.ts` — responsive screenshots → `docs/screenshots/{mobile,tablet,desktop}/`
- `playwright.sync-demo.ts` — two-tab sync demo → `docs/videos/sync-demo.gif`

## Commands

- `task dev` — start Workers dev server with logs (port 8787)
- `task fly:dev` — start Bun server (port 3000, persistent SSE)
- `task sw:build` — bundle Service Worker (sw/index.ts → static/sw.js)
- `task sw:dev` — build SW + start dev server
- `task test` — run 29 e2e tests headed + serial
- `task test:ci` — run 29 e2e tests headless + parallel
- `task docs` — generate all doc assets (screenshots + videos + sync demo)
- `task videos` — record 25 test GIFs to docs/videos/
- `task sync-demo` — record two-tab sync demo GIF
- `task screenshots` — capture screenshots at 3 viewports
- `task db:generate` — generate SQL migration from schema.ts changes (drizzle-kit)
- `task db:studio` — open Drizzle Studio (browser DB explorer)
- `task deploy` — deploy to Cloudflare Workers (runs remote D1 migrations)
- `task fly:deploy` — deploy to Fly.io

## Environment Variables

- `BETTER_AUTH_SECRET` — Auth encryption secret (set via `wrangler secret put` / `fly secrets set`)
- `BETTER_AUTH_URL` — Base URL for auth callbacks (e.g. `http://localhost:8787`)
- `SYNC_API_KEY` — Bearer token for `/api/sync/*` (Fly.io only)
- `DB_PATH` — SQLite file path (Bun mode only)
- `USE_CORROSION_DB` — Enable Corrosion sync (Fly.io only)
