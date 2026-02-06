# Project Memory

## Stack
- Hono (OpenAPIHono) on Cloudflare Workers via wrangler
- Datastar v1.0.0-RC.7 for reactive frontend (SSE-driven)
- Playwright for e2e tests
- Bun as package manager

## Key Learnings

### Datastar v1 (RC.7) Attributes
- `data-signals='{"key": val}'` (NOT `ds-store` or `data-store`)
- `data-text="$signalName"` ($ prefix required)
- `data-on:click="@post('/endpoint')"` (NOT `ds-on-click-post`)
- `data-on:load="@get('/sse')"` for persistent SSE connection
- CDN: `<script type="module" src="https://cdn.jsdelivr.net/gh/starfederation/datastar@VERSION/bundles/datastar.js">`
- All backend actions (`@get`, `@post`) expect SSE responses

### Datastar SSE Format
- Event: `datastar-patch-signals`
- Data line: `data: signals {"key": value}` (must prefix JSON with `signals `)

### Cloudflare Workers I/O Isolation (Critical)
- Workers CANNOT share I/O objects between request handlers
- Persistent SSE broadcast (holding streams open + writing from other requests) is impossible
- Error: "Cannot perform I/O on behalf of a different request"
- Hanging `await new Promise` in a handler triggers "code had hung" cancellation
- Solution: use **server-side state** (module-level variable) as single source of truth
- For true real-time push across tabs, use Durable Objects + WebSockets

### Wrangler Static Files
- Use `[assets] directory = "./static"` (NOT `[site] bucket`)
- `[site]` requires manual `getAssetFromKV` handling; `[assets]` auto-serves

### Tool Quirk
- Write tool may corrupt `@` in URLs (email protection). Verify with hexdump and fix with python/sed if needed.
