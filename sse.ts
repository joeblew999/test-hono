import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'
import type { AppEnv, BroadcastConfig } from './types'

/** Check if the client wants SSE (Datastar sends Accept: text/event-stream) */
export function isSSE(c: Context<AppEnv>): boolean {
  return c.req.header('accept')?.includes('text/event-stream') ?? false
}

/** Content-negotiated response: SSE patch-signals for Datastar, JSON for API clients */
export function respond(c: Context<AppEnv>, signals: Record<string, unknown>) {
  if (isSSE(c)) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: `signals ${JSON.stringify(signals)}`,
        event: 'datastar-patch-signals',
      })
    })
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
    })
  }
  return c.json(options.json ?? options.signals, 200)
}

type PersistentOptions = {
  initialSignals: Record<string, unknown>
  subscribe: BroadcastConfig['subscribe']
}

/** Persistent SSE: send initial data, subscribe to broadcasts, keep connection alive until client disconnects */
export function respondPersistent(c: Context<AppEnv>, options: PersistentOptions) {
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
    await new Promise<void>((resolve) => {
      stream.onAbort(() => { unsubscribe(); resolve() })
    })
  })
}
