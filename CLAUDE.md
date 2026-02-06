# Claude Code Project Instructions

## Architecture

- **index.ts** — App shell: mounts API router, OpenAPI docs, Scalar UI
- **api.ts** — All OpenAPI routes + content negotiation (`respond()` / `respondFragment()`)
- **queries.ts** — All D1 SQL queries (single source of truth)
- **static/index.html** — Datastar showcase, hits same `/api/*` routes
- **static/datastar.js** — Self-hosted Datastar v1 RC.7 bundle (+ .map for debugging)

## Content Negotiation Pattern

Single set of OpenAPI routes serves both JSON and SSE:
- `Accept: text/event-stream` (Datastar `@get`/`@post`) → SSE response
- `Accept: */*` (Scalar, curl, API clients) → JSON response
- `respond(c, data)` → patches signals via `datastar-patch-signals`
- `respondFragment(c, data)` → patches signals AND DOM via `datastar-patch-elements`
- No duplicate routes — Datastar frontend hits same URLs as REST API

## Datastar v1 (RC.7) — Self-Hosted

**Important:** RC.7 is a GitHub release, NOT on npm. We self-host `static/datastar.js`.

### Attributes (all use `data-` prefix)
- `data-signals='{"key": val}'` — reactive state
- `data-text="$signal"` — text binding ($ prefix required)
- `data-on:click="@post('/url')"` — event handler + server action
- `data-init="@get('/url')"` — run on load (NOT `data-on-load`)
- `data-class:name="expr"` — conditional CSS class
- `data-show="expr"` — conditional visibility
- `data-computed:name="expr"` — derived signal (name MUST be lowercase, HTML lowercases attrs)
- `data-bind="signal"` — two-way input binding
- `data-attr:name="expr"` — conditional HTML attribute
- `data-indicator` — loading state signal
- `data-effect="expr"` — side effect (runs when dependencies change)
- `data-on:keydown.window="expr"` — global keyboard listener

### SSE Events
- `datastar-patch-signals` — update signals: `data: signals {"key": value}`
- `datastar-patch-elements` — patch DOM (multiline data):
  ```
  data: selector #id
  data: mode inner
  data: elements <html>
  ```
  Fields: `selector`, `mode` (outer|inner|replace|prepend|append|before|after), `elements`

## D1 (Cloudflare SQLite)

- Binding: `[[d1_databases]]` in wrangler.toml
- Atomic updates: `UPDATE ... SET value = value + 1 RETURNING value`
- Single-row pattern: `CHECK (id = 1)` constraint
- Local dev: miniflare auto-creates local SQLite

## Cloudflare Workers Constraints

- Workers CANNOT share I/O objects between request handlers
- Persistent SSE broadcast across requests is impossible
- For real-time push, use Durable Objects + WebSockets

## OpenAPI / Scalar

- Scalar defaults to the first server in the `servers` array
- Production URL must be first for "Try It" to work on deployed site
- `respond()` uses `c: any` intentionally — SSE return type can't satisfy OpenAPI typed response

## Commands

- `task dev` — start dev server with logs
- `task test` — run Playwright e2e tests (9 tests)
- `task deploy` — deploy to Cloudflare Workers
- `task stop` — stop dev server
