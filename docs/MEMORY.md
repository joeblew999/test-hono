# Architecture Notes

## Content Negotiation

The key architectural pattern: **one set of OpenAPI routes serves both JSON (REST) and SSE (Datastar)**.

Response helpers in `sse.ts`:
- `isSSE(c)` — checks `Accept: text/event-stream` header
- `respond(c, data)` — SSE signal patch or JSON based on Accept header
- `respondFragment(c, data)` — SSE signal patch + DOM element patch
- `respondPersistent(stream, data)` — pushes to an open SSE stream (Fly.io only)

The Datastar frontend and the Scalar "Try It" client hit the **same endpoints** (`/api/counter`, `/api/counter/increment`, `/api/notes`, etc.). No duplicate routes.

## Dual-Mode Architecture

Same codebase deploys to both Cloudflare Workers and Fly.io:
- **Workers** (`index.ts`): D1 database, one-shot SSE (request → response → close)
- **Fly.io** (`server.ts`): bun:sqlite, persistent SSE with real-time broadcast across tabs
- `db.ts` adapter wraps bun:sqlite to match D1Database async interface — `queries.ts` unchanged
- `api.ts` route factory accepts optional `BroadcastConfig` — present on Fly.io, absent on Workers

## Datastar v1 RC.7 (Self-Hosted)

RC.7 is a GitHub-only release (Dec 2025), not published to npm. We self-host:
- `static/datastar.js` — production bundle (~14KB)
- `static/datastar.js.map` — source map for browser debugging

### SSE Events
- `datastar-patch-signals` — update reactive signals
  - Data format: `signals {"key": value}` (prefix `signals ` before JSON)
- `datastar-patch-elements` — patch DOM with server-rendered HTML
  - Multiline data format: `selector #id`, `mode inner`, `elements <html>`
  - We use `inner` mode exclusively (most reliable for list re-renders with Idiomorph)

### Version Pitfall
npm's `@starfederation/datastar` latest is beta.11 (older). RC.7 uses different event names and attribute names. Never mix versions.

## Cloudflare Workers I/O Isolation

Workers CANNOT share I/O objects between request handlers. This means:
- Persistent SSE broadcast is impossible on Workers
- Module-level variables are per-isolate, NOT shared across production instances
- Counter/notes state uses D1 (Cloudflare's SQLite) for durable, shared state
- For real-time push: use Fly.io (long-lived VMs with in-process broadcast)

## D1 Single-Row Pattern

The counter uses a single-row table with a `CHECK (id = 1)` constraint:
```sql
CREATE TABLE counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value INTEGER NOT NULL DEFAULT 0
);
INSERT INTO counter (id, value) VALUES (1, 0);
```

Atomic increment: `UPDATE counter SET value = value + 1 WHERE id = 1 RETURNING value`

## Static Files

Wrangler serves static files via `[assets] directory = "./static"` in `wrangler.toml`. Do NOT use `[site] bucket` — that requires manual `getAssetFromKV` handling.

## Testing

- 15 Playwright e2e tests (9 counter + 6 notes/demo)
- Default: headed + serial (real browser, zero race conditions, ~12s)
- CI mode: `HEADED=0` for headless + parallel (~4s)
- Screenshots: separate config (`playwright.screenshots.ts`) via `task screenshots`
