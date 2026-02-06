# Claude Code Project Instructions

## Architecture

- **index.ts** — Cloudflare Workers entry point
- **server.ts** — Bun/Fly.io entry point (persistent SSE with broadcast)
- **api.ts** — Route composer: imports from routes/, accepts optional BroadcastConfig
- **routes/counter.ts** — Counter schemas, OpenAPI routes, handlers
- **routes/notes.ts** — Notes CRUD schemas, OpenAPI routes, handlers
- **sse.ts** — SSE helpers: isSSE, respond, respondFragment, respondPersistent
- **types.ts** — Shared types: AppEnv, BroadcastConfig
- **queries.ts** — All D1 SQL queries (counter + notes)
- **db.ts** — bun:sqlite → D1 adapter (Bun mode only)
- **docs.ts** — OpenAPI doc + Scalar mount helper
- **static/index.html** — Datastar showcase (12 sections, 20 patterns)
- **static/datastar.js** — Self-hosted Datastar v1 RC.7 bundle (+ .map)

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

## Datastar v1 (RC.7) — Self-Hosted

**Important:** RC.7 is a GitHub release, NOT on npm. We self-host `static/datastar.js`.

### Working Attributes
- `data-signals`, `data-text`, `data-on:click`, `data-init`, `data-class`, `data-show`
- `data-computed` (name MUST be lowercase), `data-bind`, `data-attr`, `data-effect`
- `data-style`, `data-json-signals`, `data-on:keydown.window`, `data-on:input.debounce`
- Actions: `@get`, `@post`, `@delete`

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

- 15 Playwright e2e tests (9 counter + 6 notes/demo)
- `task test` — headed + serial (real browser, ~12s, zero race conditions)
- `task test:ci` — headless + parallel (fast, ~4s, for CI)
- `task screenshots` — headed capture to docs/screenshots/
- `pressSequentially` not `fill` for `data-bind` inputs
- Text-based locators (`{ hasText: 'X' }`) for Idiomorph-morphed lists

## Commands

- `task dev` — start Workers dev server with logs (port 8787)
- `task fly:dev` — start Bun server (port 3000, persistent SSE)
- `task test` — run 15 e2e tests headed + serial
- `task test:ci` — run 15 e2e tests headless + parallel
- `task deploy` — deploy to Cloudflare Workers (runs remote D1 migrations)
- `task fly:deploy` — deploy to Fly.io
- `task screenshots` — capture headed screenshots to docs/screenshots/
