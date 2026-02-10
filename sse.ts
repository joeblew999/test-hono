import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'
import type { AppEnv, BroadcastConfig } from './types'
import { getCount } from './queries'

/** Check if the client wants SSE (Datastar sends Accept: text/event-stream) */
export function isSSE(c: Context<AppEnv>): boolean {
  return c.req.header('accept')?.includes('text/event-stream') ?? false
}

/** Content-negotiated response: SSE patch-signals for Datastar, JSON for API clients */
export function respond(c: Context<AppEnv>, signals: Record<string, unknown>) {
  if (isSSE(c)) {
    // Cast: streamSSE returns Response, but OpenAPI handlers expect TypedResponse
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: `signals ${JSON.stringify(signals)}`,
        event: 'datastar-patch-signals',
      })
    }) as any
  }
  return c.json(signals, 200)
}

type Fragment = {
  selector: string
  html: string
  mode?: 'inner' | 'outer' | 'prepend' | 'append' | 'before' | 'after'
}

type FragmentOptions = {
  signals: Record<string, unknown>
  fragments: Fragment[]
  json?: unknown
}

/** Content-negotiated response with HTML fragments: SSE patch-signals + patch-elements for Datastar, JSON for API clients */
export function respondFragment(c: Context<AppEnv>, options: FragmentOptions) {
  if (isSSE(c)) {
    // Cast: streamSSE returns Response, but OpenAPI handlers expect TypedResponse
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: `signals ${JSON.stringify(options.signals)}`,
        event: 'datastar-patch-signals',
      })
      for (const frag of options.fragments) {
        await stream.writeSSE({
          data: `selector ${frag.selector}\nmode ${frag.mode ?? 'inner'}\nelements ${frag.html}`,
          event: 'datastar-patch-elements',
        })
      }
    }) as any
  }
  return c.json(options.json ?? options.signals, 200)
}

type PersistentOptions = {
  initialSignals: Record<string, unknown>
  subscribe: BroadcastConfig['subscribe']
}

/** Persistent SSE: send initial data, subscribe to broadcasts, keep connection alive until client disconnects */
export function respondPersistent(c: Context<AppEnv>, options: PersistentOptions) {
  // Cast: streamSSE returns Response, but OpenAPI handlers expect TypedResponse
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: `signals ${JSON.stringify(options.initialSignals)}`,
      event: 'datastar-patch-signals',
    })
    const unsubscribe = options.subscribe(async (data) => {
      try {
        await stream.writeSSE({
          data: `signals ${JSON.stringify(data)}`,
          event: 'datastar-patch-signals',
        })
      } catch {
        unsubscribe()
      }
    })
    // Heartbeat every 30s prevents Cloudflare 524 timeout (100s idle limit)
    const heartbeat = setInterval(async () => {
      try { await stream.write(': keepalive\n\n') }
      catch { clearInterval(heartbeat) }
    }, 30_000)
    await new Promise<void>((resolve) => {
      stream.onAbort(() => { clearInterval(heartbeat); unsubscribe(); resolve() })
    })
  }) as any
}

export { type FragmentOptions }

const POLL_INTERVAL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 30_000

/** Persistent SSE via D1 polling: polls counter every 2s, sends updates when state changes.
 *  Used on Workers where there's no in-memory broadcast. Includes heartbeat for Cloudflare 524 prevention. */
export function respondPersistentPolling(c: Context<AppEnv>, initialSignals: Record<string, unknown>) {
  const db = c.env.DB
  return streamSSE(c, async (stream) => {
    let isOpen = true
    stream.onAbort(() => { isOpen = false })

    // Send initial state
    await stream.writeSSE({
      data: `signals ${JSON.stringify(initialSignals)}`,
      event: 'datastar-patch-signals',
    })

    let lastCount = (initialSignals.count as number) ?? -1
    let ticksSinceWrite = 0
    const heartbeatTicks = Math.floor(HEARTBEAT_INTERVAL_MS / POLL_INTERVAL_MS)

    while (isOpen) {
      await stream.sleep(POLL_INTERVAL_MS)
      if (!isOpen) break

      try {
        const count = await getCount(db)

        if (count !== lastCount) {
          lastCount = count
          ticksSinceWrite = 0
          await stream.writeSSE({
            data: `signals ${JSON.stringify({ count })}`,
            event: 'datastar-patch-signals',
          })
        } else {
          ticksSinceWrite++
          if (ticksSinceWrite >= heartbeatTicks) {
            ticksSinceWrite = 0
            await stream.write(': keepalive\n\n')
          }
        }
      } catch {
        // D1 error — skip this tick, send heartbeat to stay alive
        ticksSinceWrite++
        if (ticksSinceWrite >= heartbeatTicks) {
          ticksSinceWrite = 0
          try { await stream.write(': keepalive\n\n') } catch { break }
        }
      }
    }
  }) as any
}

/** Persistent SSE via D1 polling with HTML fragment support.
 *  Sends initial signals+fragments, then polls via callback. Returns FragmentOptions when changed, null when unchanged.
 *  Used for notes list (and any future lists) on Workers. */
export function respondPersistentPollingFragments(
  c: Context<AppEnv>,
  initial: FragmentOptions,
  poll: () => Promise<FragmentOptions | null>,
) {
  return streamSSE(c, async (stream) => {
    let isOpen = true
    stream.onAbort(() => { isOpen = false })

    // Send initial signals + fragments
    await stream.writeSSE({
      data: `signals ${JSON.stringify(initial.signals)}`,
      event: 'datastar-patch-signals',
    })
    for (const frag of initial.fragments) {
      await stream.writeSSE({
        data: `selector ${frag.selector}\nmode ${frag.mode ?? 'inner'}\nelements ${frag.html}`,
        event: 'datastar-patch-elements',
      })
    }

    let ticksSinceWrite = 0
    const heartbeatTicks = Math.floor(HEARTBEAT_INTERVAL_MS / POLL_INTERVAL_MS)

    while (isOpen) {
      await stream.sleep(POLL_INTERVAL_MS)
      if (!isOpen) break

      try {
        const result = await poll()
        if (result) {
          ticksSinceWrite = 0
          await stream.writeSSE({
            data: `signals ${JSON.stringify(result.signals)}`,
            event: 'datastar-patch-signals',
          })
          for (const frag of result.fragments) {
            await stream.writeSSE({
              data: `selector ${frag.selector}\nmode ${frag.mode ?? 'inner'}\nelements ${frag.html}`,
              event: 'datastar-patch-elements',
            })
          }
        } else {
          ticksSinceWrite++
          if (ticksSinceWrite >= heartbeatTicks) {
            ticksSinceWrite = 0
            await stream.write(': keepalive\n\n')
          }
        }
      } catch {
        ticksSinceWrite++
        if (ticksSinceWrite >= heartbeatTicks) {
          ticksSinceWrite = 0
          try { await stream.write(': keepalive\n\n') } catch { break }
        }
      }
    }
  }) as any
}
