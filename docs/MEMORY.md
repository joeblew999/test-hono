# Architecture Notes

## Content Negotiation

The key architectural pattern: **one set of OpenAPI routes serves both JSON (REST) and SSE (Datastar)**.

Two response helpers in `api.ts`:
- `respond(c, data)` — checks `Accept` header → `datastar-patch-signals` SSE or JSON
- `respondFragment(c, data)` — sends both signal patch AND DOM element patch via SSE

This means the Datastar frontend and the Scalar "Try It" client hit the **same endpoints** (`/api/counter`, `/api/counter/increment`, etc.). No duplicate routes.

## Datastar v1 RC.7 (Self-Hosted)

RC.7 is a GitHub-only release (Dec 2025), not published to npm. We self-host:
- `static/datastar.js` — production bundle (30KB)
- `static/datastar.js.map` — source map for browser debugging

### SSE Events
- `datastar-patch-signals` — update reactive signals
  - Data format: `signals {"key": value}` (prefix `signals ` before JSON)
- `datastar-patch-elements` — patch DOM with server-rendered HTML
  - Multiline data format: `selector #id`, `mode inner`, `elements <html>`
  - Modes: outer, inner, replace, prepend, append, before, after

### Version Pitfall
npm's `@starfederation/datastar` latest is beta.11 (older). RC.7 uses different event names and attribute names. Never mix versions.

## Cloudflare Workers I/O Isolation

Workers CANNOT share I/O objects between request handlers. This means:
- Persistent SSE broadcast (holding streams open and writing from other requests) is impossible
- Module-level variables are per-isolate, NOT shared across production instances
- Counter state uses D1 (Cloudflare's SQLite) for durable, shared state
- For true real-time push across tabs, you'd need Durable Objects + WebSockets

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
