# test-hono

Hono + Datastar counter app on Cloudflare Workers.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/joeblew999/test-hono)

**Live:** https://test-hono.gedw99.workers.dev

## Stack

- [Hono](https://hono.dev) (OpenAPIHono) — API framework with Zod OpenAPI + Swagger UI
- [Datastar](https://data-star.dev) v1.0.0-RC.7 — reactive frontend via SSE
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — serverless runtime
- [Playwright](https://playwright.dev) — end-to-end tests
- [Bun](https://bun.sh) — package manager
- [Task](https://taskfile.dev) — task runner

## Quick Start

```sh
task deps       # install dependencies + playwright browsers
task dev        # start dev server with live logs
```

Open http://localhost:8787 for the counter UI, or http://localhost:8787/ui for Swagger.

## Commands

```
task            # list all commands
task dev        # start dev server with logs
task start      # start server in background
task stop       # stop dev server
task test       # run e2e tests (auto-starts server)
task deploy     # deploy to Cloudflare Workers
task test:deployed  # run e2e tests against deployed worker
task login      # authenticate with Cloudflare
task deps       # install dependencies
```

## Design

- No Next.js. No Node.js. Just Bun + Hono + Datastar.
- Type-safe API via Zod OpenAPI schemas.
- Taskfile wraps everything for ease of use.
- Server-side state (module-level variable) is the source of truth locally — works across multiple tabs and Swagger UI.
- All URLs are relative — same code runs locally and on Cloudflare with no changes.

## Known Limitations

- **Module-level state is per-isolate in production.** On Cloudflare Workers, each isolate has its own copy of `serverCount`. This means multi-tab sync works perfectly in `wrangler dev` (single process) but not in production (multiple isolates). For production-grade shared state, use [Workers KV](https://developers.cloudflare.com/kv/) or [Durable Objects](https://developers.cloudflare.com/durable-objects/).

## Architecture Notes

See [docs/MEMORY.md](docs/MEMORY.md) for detailed learnings, especially around Cloudflare Workers I/O isolation constraints.
