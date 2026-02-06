import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

const counterStoreSchema = z.object({
  count: z.number().int().openapi({
    example: 1,
  }),
})

const incrementRoute = createRoute({
  method: 'post',
  path: '/counter/increment',
  request: {
    body: {
      content: {
        'application/json': {
          schema: counterStoreSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: counterStoreSchema,
        },
      },
      description: 'Incremented counter',
    },
  },
})

const decrementRoute = createRoute({
  method: 'post',
  path: '/counter/decrement',
  request: {
    body: {
      content: {
        'application/json': {
          schema: counterStoreSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: counterStoreSchema,
        },
      },
      description: 'Decremented counter',
    },
  },
})

interface Counter {
  getCount: () => number;
  setCount: (n: number) => void;
}

export default (counter: Counter) => {
  const app = new OpenAPIHono()

  app.openapi(incrementRoute, (c) => {
    counter.setCount(counter.getCount() + 1)
    return c.json({ count: counter.getCount() })
  })

  app.openapi(decrementRoute, (c) => {
    counter.setCount(counter.getCount() - 1)
    return c.json({ count: counter.getCount() })
  })

  return app
}
