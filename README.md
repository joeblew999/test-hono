# test-hono

Hono + Datastar pattern showcase — dual-mode deployment to Cloudflare Workers (one-shot SSE) and Fly.io (persistent SSE with real-time broadcast). Same codebase, same tests, same frontend.

**repo** https://github.com/joeblew999/test-hono

**Cloudflare Workers:** https://test-hono.gedw99.workers.dev
**Fly.io (persistent SSE):** https://test-hono-bun.fly.dev

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/joeblew999/test-hono)


## Stack

- [Hono](https://hono.dev) (OpenAPIHono) — API framework with Zod OpenAPI + [Scalar](https://scalar.com) API docs
- [Datastar](https://data-star.dev) v1.0.0-RC.7 — reactive frontend via SSE
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — serverless runtime (one-shot SSE)
- [Fly.io](https://fly.io) + [Bun](https://bun.sh) — persistent runtime (real-time SSE broadcast)
- [Cloudflare D1](https://developers.cloudflare.com/d1/) / bun:sqlite — SQLite on both platforms
- [Playwright](https://playwright.dev) — end-to-end tests (same 9 tests pass on all 4 targets)
- [Task](https://taskfile.dev) — task runner

## Prerequisites

Just install [Task](https://taskfile.dev) — everything else (Bun, npm packages, Playwright) is handled by `task deps`.

## Quick Start

### Cloudflare Workers (one-shot SSE)

```sh
task deps       # install Bun (if needed) + all dependencies
task dev        # start dev server with live logs (port 8787)
task test       # run 9 e2e tests
task deploy     # deploy to Cloudflare Workers
```

### Fly.io (persistent SSE with real-time broadcast)

```sh
task deps       # install Bun (if needed) + all dependencies
task fly:dev    # start Bun server with persistent SSE (port 3000)
task fly:test   # run same 9 e2e tests against Bun server
task fly:deploy # deploy to Fly.io (creates app + volume if needed)
```

Open http://localhost:8787 (Workers) or http://localhost:3000 (Bun) for the counter UI, append `/ui` for API docs (Scalar).

## Dual-Mode Architecture

This project runs on **two platforms from a single codebase** — no code duplication, no feature flags, no conditional imports. The same `api.ts`, `queries.ts`, and `index.html` work on both.

```
Cloudflare Workers (index.ts)          Fly.io / Bun (server.ts)
┌─────────────────────────┐            ┌─────────────────────────┐
│  D1 (Cloudflare SQLite) │            │  bun:sqlite (local)     │
│  One-shot SSE responses │            │  Persistent SSE streams │
│  Tabs sync on action    │            │  Real-time broadcast    │
└──────────┬──────────────┘            └──────────┬──────────────┘
           │                                      │
           └──────────┬───────────────────────────┘
                      │
              ┌───────┴────────┐
              │    api.ts      │  ← shared routes + content negotiation
              │  queries.ts    │  ← shared SQL (D1 interface)
              │  index.html    │  ← shared Datastar frontend
              │  9 Playwright  │  ← shared tests
              │    tests       │
              └────────────────┘
```

### How it works

The `api.ts` factory accepts an optional `BroadcastConfig`:

```ts
// Workers: no broadcast → one-shot SSE (current behavior)
app.route('/api', api())

// Bun: broadcast provided → persistent SSE with real-time push
app.route('/api', api(broadcastConfig))
```

When broadcast is wired in:
- **GET /counter** (SSE) keeps the connection open and subscribes to changes
- **POST /counter/increment** writes to SQLite, responds to the caller, AND broadcasts to all open connections
- Tab B instantly sees Tab A's increment — no polling, no action needed

When broadcast is absent (Cloudflare Workers):
- Behavior is identical to before — one-shot SSE, tabs sync on their next action
- Zero overhead, zero code paths touched

### The D1 adapter trick

`queries.ts` is typed for Cloudflare's `D1Database` interface. Instead of rewriting queries for bun:sqlite, a thin adapter in `db.ts` makes bun:sqlite look like D1:

```ts
// db.ts — makes bun:sqlite speak D1
const d1 = createD1Compat(sqliteDb)
// queries.ts works unchanged: db.prepare(sql).bind(v).first<T>()
```

Result: **zero changes** to `queries.ts` across platforms.

### Real-time SSE in action

```
Tab A                          Bun Server                      Tab B
  │                                │                              │
  │── GET /api/counter (SSE) ─────>│                              │
  │<── event: count=0 ────────────│                              │
  │   (connection stays open)      │                              │
  │                                │<── GET /api/counter (SSE) ──│
  │                                │── event: count=0 ──────────>│
  │                                │   (stays open)               │
  │                                │                              │
  │── POST /increment ───────────>│                              │
  │<── one-shot SSE: count=1 ────│                              │
  │                                │── broadcast: count=1 ──────>│
  │                                │   (via persistent SSE)       │
  │                                │                              │
  │   Tab A shows 1               │              Tab B shows 1   │
```

## Commands

```
# Cloudflare Workers
task            # list all commands
task dev        # start dev server with logs (port 8787)
task start      # start server in background
task stop       # stop dev server
task test       # run e2e tests (auto-starts server)
task deploy     # deploy to Cloudflare Workers (runs remote migrations)
task test:deployed  # run e2e tests against deployed worker

# Fly.io (Bun + SQLite + persistent SSE)
task fly:dev    # start Bun server (port 3000, persistent SSE)
task fly:start  # start in background
task fly:stop   # stop Bun server
task fly:test   # run e2e tests against Bun server
task fly:deploy # deploy to Fly.io (creates app + volume if needed)
task fly:test:deployed  # run e2e tests against deployed Fly.io app
task fly:login  # authenticate with Fly.io
task fly:launch # create Fly.io app + volume (idempotent)

# Database & setup
task db:create  # create remote D1 database (one-time)
task db:migrate # apply migrations locally
task db:migrate:remote  # apply migrations to remote database
task login      # authenticate with Cloudflare
task ci:secrets # set Cloudflare secrets in GitHub for CI
task deps       # install Bun + all dependencies
```

## CI Deployment

Push-triggered CI deploys need a Cloudflare API token. One-time setup:

```sh
task login                           # authenticate locally (browser)
# Create an API token at https://dash.cloudflare.com/profile/api-tokens
# → Use the "Edit Cloudflare Workers" template
task ci:secrets -- YOUR_API_TOKEN    # sets GitHub secrets automatically
```

After that, every push to `main` auto-deploys via GitHub Actions.

## Datastar Patterns Showcased

The index page demonstrates 13 Datastar v1 patterns:

| Pattern | Description |
|---------|-------------|
| `data-signals` | Reactive state store |
| `data-text` | Text binding |
| `data-on:click` | Event handlers with server actions |
| `data-init` | Initialization (fetch on load) |
| `data-class` | Conditional CSS classes |
| `data-show` | Conditional visibility |
| `data-computed` | Derived signals |
| `data-bind` | Two-way input binding |
| `data-attr` | Conditional HTML attributes |
| `data-indicator` | Loading state |
| `data-effect` | Reactive side effects |
| `data-on:keydown.window` | Global keyboard listeners |
| `datastar-patch-elements` | Server-rendered HTML fragments via SSE |

## Why This Matters

Most web stacks force you to choose: either you get a nice API (OpenAPI, typed schemas, auto-generated docs) or you get a reactive frontend (React, SvelteKit, Next.js). Combining both usually means duplicating every endpoint — one for the API, one for the UI — and pulling in a JavaScript framework with a build step, a virtual DOM, and a bundle measured in megabytes.

This project eliminates that tradeoff with **content negotiation**. A single set of OpenAPI routes serves both:

- **JSON** for API clients, Scalar "Try It", curl, and any external consumer
- **SSE** for the Datastar frontend, which reactively patches the DOM

The same `POST /api/counter/increment` endpoint that returns `{"count": 3}` to curl returns a `datastar-patch-signals` SSE event to the browser. One route definition. One Zod schema. One handler. Two audiences.

The frontend is **zero-build HTML** — no JSX, no bundler, no virtual DOM. Datastar attributes (`data-text`, `data-on:click`, `data-show`, `data-computed`) make the page reactive through declarative HTML. The entire frontend is a single `index.html` with no compilation step. Add a Datastar attribute, reload the page, done.

**The dual-mode breakthrough:** The same codebase deploys to both serverless (Cloudflare Workers) and persistent (Fly.io) runtimes. On Workers, SSE is one-shot — each request gets a response and the connection closes. On Fly.io, the same GET endpoint holds the connection open and broadcasts changes in real-time. The difference is a single optional parameter (`BroadcastConfig`) passed to the route factory. No `if` statements, no environment detection, no platform-specific code paths. Same routes, same frontend, same 9 tests — verified on all 4 targets (Workers local, Workers production, Bun local, Fly.io production).

| Traditional SPA | This project |
|----------------|-------------|
| React/Vue/Svelte + build step | Plain HTML + Datastar attributes |
| REST API + separate SSE/WebSocket layer | Single content-negotiated routes |
| Duplicate route definitions (API + frontend) | One set of OpenAPI routes |
| Client-side state management (Redux, Zustand) | Server state via SQLite + SSE signals |
| Hundreds of npm dependencies | ~4 runtime dependencies |
| One deployment target | Dual-mode: Workers (serverless) + Fly.io (persistent) |
| Polling or WebSockets for real-time | Persistent SSE broadcast (zero client-side code) |

## Design

- No Next.js. No Node.js. Just Bun + Hono + Datastar.
- Self-hosted Datastar v1 RC.7 (no CDN dependency).
- Type-safe API via Zod OpenAPI schemas.
- Content negotiation: same routes serve JSON (API) and SSE (Datastar).
- Dual-mode: Cloudflare Workers (D1, one-shot SSE) and Fly.io (bun:sqlite, persistent SSE).
- D1 adapter: bun:sqlite wrapped to match D1Database interface — zero query changes across platforms.
- Atomic increment/decrement using `UPDATE ... SET value = value + 1 RETURNING value`.
- Taskfile wraps everything for ease of use (all tasks are idempotent).
- All URLs are relative — same code runs locally and in production with no changes.

## File Structure

```
index.ts          # Cloudflare Workers entry point
server.ts         # Bun/Fly.io entry point (persistent SSE)
api.ts            # Shared OpenAPI routes + content negotiation
queries.ts        # Shared D1-typed SQL queries
db.ts             # bun:sqlite → D1 adapter (Bun mode only)
static/
  index.html      # Datastar frontend (7 sections, 13 patterns)
  datastar.js     # Self-hosted Datastar v1 RC.7
  datastar.js.map # Source map for browser debugging
tests/
  counter.spec.ts # 9 Playwright e2e tests
migrations/
  0001_init.sql   # Counter table (single-row pattern)
wrangler.toml     # Cloudflare Workers config
fly.toml          # Fly.io config
Dockerfile        # Bun container for Fly.io
Taskfile.yml      # All dev/test/deploy commands
```

## Reference Repos

- [w3cj/hono-open-api-starter](https://github.com/w3cj/hono-open-api-starter) — Hono + Drizzle + Zod OpenAPI + Scalar starter (the community template)
- [w3cj/hono-node-deployment-examples](https://github.com/w3cj/hono-node-deployment-examples) — deploying Hono to Fly.io, Vercel, Cloudflare, etc.
- [superfly/corrosion](https://github.com/superfly/corrosion) — SQLite + CRDT replication + query subscriptions (the next step for multi-node real-time)

## Architecture Notes

See [docs/MEMORY.md](docs/MEMORY.md) for detailed learnings, especially around Cloudflare Workers I/O isolation constraints and the persistent SSE broadcast pattern.
