import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'
import { getCount, increment, decrement, setCount, resetCount } from './queries'

type Bindings = {
  DB: D1Database
}

// Optional broadcast for persistent SSE (Bun/Fly.io mode)
export type BroadcastConfig = {
  subscribe: (listener: (data: { count: number }) => void) => () => void
  broadcast: (data: { count: number }) => void
}

const CounterSchema = z.object({
  count: z.number().int().openapi({
    example: 1,
  }),
}).openapi('Counter')

// Content-negotiation: SSE for Datastar, JSON for API clients
function respond(c: any, data: { count: number }) {
  if (c.req.header('accept')?.includes('text/event-stream')) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: `signals ${JSON.stringify(data)}`,
        event: 'datastar-patch-signals',
      })
    })
  }
  return c.json(data, 200)
}

// SSE fragment response for Datastar datastar-patch-elements
function respondFragment(c: any, data: { count: number; html: string; renderedAt: string }) {
  if (c.req.header('accept')?.includes('text/event-stream')) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: `signals ${JSON.stringify({ count: data.count })}`,
        event: 'datastar-patch-signals',
      })
      await stream.writeSSE({
        data: `selector #server-fragment\nmode inner\nelements ${data.html}`,
        event: 'datastar-patch-elements',
      })
    })
  }
  return c.json(data, 200)
}

const SetCountSchema = z.object({
  inputValue: z.number().int().openapi({
    example: 42,
    description: 'Value to set the counter to',
  }),
}).openapi('SetCount')

const getCounterRoute = createRoute({
  method: 'get',
  path: '/counter',
  tags: ['Counter'],
  summary: 'Get current count',
  description: 'Returns the current counter value from D1.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CounterSchema,
        },
      },
      description: 'Current counter value',
    },
  },
})

const incrementRoute = createRoute({
  method: 'post',
  path: '/counter/increment',
  tags: ['Counter'],
  summary: 'Increment counter',
  description: 'Atomically increments the counter by 1 and returns the new value.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CounterSchema,
        },
      },
      description: 'Incremented counter',
    },
  },
})

const decrementRoute = createRoute({
  method: 'post',
  path: '/counter/decrement',
  tags: ['Counter'],
  summary: 'Decrement counter',
  description: 'Atomically decrements the counter by 1 and returns the new value.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CounterSchema,
        },
      },
      description: 'Decremented counter',
    },
  },
})

const setCountRoute = createRoute({
  method: 'post',
  path: '/counter/set',
  tags: ['Counter'],
  summary: 'Set counter to specific value',
  description: 'Sets the counter to the provided value. Datastar sends all signals as the request body; Zod strips extras.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SetCountSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CounterSchema,
        },
      },
      description: 'Counter set to new value',
    },
  },
})

const fragmentRoute = createRoute({
  method: 'get',
  path: '/counter/fragment',
  tags: ['Counter'],
  summary: 'Server-rendered HTML fragment',
  description: 'Returns the counter as a server-rendered HTML fragment. Datastar receives an SSE patch-elements event; API clients receive JSON with the HTML string.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            count: z.number().int(),
            html: z.string(),
            renderedAt: z.string(),
          }).openapi('CounterFragment'),
        },
      },
      description: 'Server-rendered counter fragment',
    },
  },
})

const resetRoute = createRoute({
  method: 'post',
  path: '/counter/reset',
  tags: ['Counter'],
  summary: 'Reset counter',
  description: 'Resets the counter to 0. Used for test isolation.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CounterSchema,
        },
      },
      description: 'Counter reset to 0',
    },
  },
})

export default (bc?: BroadcastConfig) => {
  const app = new OpenAPIHono<{ Bindings: Bindings }>()

  app.openapi(getCounterRoute, async (c) => {
    const count = await getCount(c.env.DB)

    // Persistent SSE mode: subscribe to broadcasts and keep alive
    if (bc?.subscribe && c.req.header('accept')?.includes('text/event-stream')) {
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({
          data: `signals ${JSON.stringify({ count })}`,
          event: 'datastar-patch-signals',
        })
        const unsubscribe = bc.subscribe(async (data) => {
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

    return respond(c, { count })
  })

  app.openapi(incrementRoute, async (c) => {
    const count = await increment(c.env.DB)
    bc?.broadcast({ count })
    return respond(c, { count })
  })

  app.openapi(decrementRoute, async (c) => {
    const count = await decrement(c.env.DB)
    bc?.broadcast({ count })
    return respond(c, { count })
  })

  app.openapi(setCountRoute, async (c) => {
    const { inputValue } = c.req.valid('json')
    const count = await setCount(c.env.DB, inputValue)
    bc?.broadcast({ count })
    return respond(c, { count })
  })

  app.openapi(fragmentRoute, async (c) => {
    const count = await getCount(c.env.DB)
    const renderedAt = new Date().toISOString()
    const html = `<div class="fragment-content"><strong>${count}</strong> <span>as of ${renderedAt}</span></div>`
    return respondFragment(c, { count, html, renderedAt })
  })

  app.openapi(resetRoute, async (c) => {
    await resetCount(c.env.DB)
    bc?.broadcast({ count: 0 })
    return respond(c, { count: 0 })
  })

  return app
}
