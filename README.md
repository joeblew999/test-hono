# test-hono

Hono + Datastar pattern showcase on Cloudflare Workers — a multi-section demo of Datastar v1 reactive patterns backed by OpenAPI content negotiation and D1 persistence.

**repo** https://github.com/joeblew999/test-hono

**Live:** https://test-hono.gedw99.workers.dev

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/joeblew999/test-hono)


## Stack

- [Hono](https://hono.dev) (OpenAPIHono) — API framework with Zod OpenAPI + [Scalar](https://scalar.com) API docs
- [Datastar](https://data-star.dev) v1.0.0-RC.7 — reactive frontend via SSE
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — serverless runtime
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — SQLite database for durable state
- [Playwright](https://playwright.dev) — end-to-end tests
- [Bun](https://bun.sh) — package manager
- [Task](https://taskfile.dev) — task runner

## Prerequisites

Just install [Task](https://taskfile.dev) — everything else (Bun, npm packages, Playwright) is handled by `task deps`.

## Quick Start

```sh
task deps       # install Bun (if needed) + all dependencies
task dev        # start dev server with live logs
```

Open http://localhost:8787 for the counter UI, or http://localhost:8787/ui for API docs (Scalar).

## Commands

```
task            # list all commands
task dev        # start dev server with logs
task start      # start server in background
task stop       # stop dev server
task test       # run e2e tests (auto-starts server)
task deploy     # deploy to Cloudflare Workers (runs remote migrations)
task test:deployed  # run e2e tests against deployed worker
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

## Database Setup

Counter state is stored in Cloudflare D1 (SQLite). Local development uses miniflare's built-in SQLite automatically.

For production (one-time):

```sh
task db:create          # creates remote D1 database, prints database_id
# Copy the database_id into wrangler.toml
task db:migrate:remote  # applies migrations to remote database
```

Migrations are applied automatically during `task start` (local) and `task deploy` (remote).

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

The result is a stack with unusually few moving parts:

| Traditional SPA | This project |
|----------------|-------------|
| React/Vue/Svelte + build step | Plain HTML + Datastar attributes |
| REST API + separate SSE/WebSocket layer | Single content-negotiated routes |
| Duplicate route definitions (API + frontend) | One set of OpenAPI routes |
| Client-side state management (Redux, Zustand) | Server state via D1 + SSE signals |
| Hundreds of npm dependencies | ~4 runtime dependencies |
| Node.js server | Cloudflare Workers (V8 isolates, zero cold start) |

This isn't a toy. The same pattern scales: add a Drizzle ORM layer for schema-driven SQL, add more OpenAPI routes with Zod validation, and the content negotiation + Datastar frontend approach stays the same. The 9 Playwright e2e tests prove it works end-to-end, locally and in production.

## Design

- No Next.js. No Node.js. Just Bun + Hono + Datastar.
- Self-hosted Datastar v1 RC.7 (no CDN dependency).
- Type-safe API via Zod OpenAPI schemas.
- Content negotiation: same routes serve JSON (API) and SSE (Datastar).
- Durable counter state via D1 (Cloudflare's SQLite).
- Atomic increment/decrement using `UPDATE ... SET value = value + 1 RETURNING value`.
- Taskfile wraps everything for ease of use.
- All URLs are relative — same code runs locally and on Cloudflare with no changes.

## Known Limitations

- **Tabs sync on action, not in real-time.** Each tab gets the latest D1 count when it performs an action (increment/decrement). Idle tabs don't receive push updates. For real-time push, Durable Objects + WebSockets would be needed.

## Reference Repos

- [w3cj/hono-open-api-starter](https://github.com/w3cj/hono-open-api-starter) — Hono + Drizzle + Zod OpenAPI + Scalar starter (the community template)
- [w3cj/hono-node-deployment-examples](https://github.com/w3cj/hono-node-deployment-examples) — deploying Hono to Fly.io, Vercel, Cloudflare, etc.

## Architecture Notes

See [docs/MEMORY.md](docs/MEMORY.md) for detailed learnings, especially around Cloudflare Workers I/O isolation constraints.
