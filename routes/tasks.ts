import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { CreateTaskSchema, UpdateTaskSchema, TaskSchema, TaskListSchema, TaskFilterSchema, ErrorSchema, SuccessSchema } from '../validators'
import { listTasks, createTask, getTask, updateTask, deleteTask } from '../task-logic'
import { requireAuth } from '../auth'
import type { AppEnv } from '../types'

// --- Route Definitions ---

const listTasksRoute = createRoute({
  method: 'get',
  path: '/tasks',
  tags: ['Tasks'],
  summary: 'List tasks for authenticated user',
  request: { query: TaskFilterSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: TaskListSchema } },
      description: 'Tasks list',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

const createTaskRoute = createRoute({
  method: 'post',
  path: '/tasks',
  tags: ['Tasks'],
  summary: 'Create a task',
  request: {
    body: { content: { 'application/json': { schema: CreateTaskSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: TaskSchema } },
      description: 'Created task',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

const getTaskRoute = createRoute({
  method: 'get',
  path: '/tasks/{id}',
  tags: ['Tasks'],
  summary: 'Get a task by ID',
  request: {
    params: z.object({ id: z.string().pipe(z.coerce.number().int()) }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: TaskSchema } },
      description: 'Task details',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not found',
    },
  },
})

const updateTaskRoute = createRoute({
  method: 'patch',
  path: '/tasks/{id}',
  tags: ['Tasks'],
  summary: 'Update a task',
  request: {
    params: z.object({ id: z.string().pipe(z.coerce.number().int()) }),
    body: { content: { 'application/json': { schema: UpdateTaskSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: TaskSchema } },
      description: 'Updated task',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not found',
    },
  },
})

const deleteTaskRoute = createRoute({
  method: 'delete',
  path: '/tasks/{id}',
  tags: ['Tasks'],
  summary: 'Delete a task',
  request: {
    params: z.object({ id: z.string().pipe(z.coerce.number().int()) }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessSchema } },
      description: 'Task deleted',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

// --- Handlers ---

export default () => {
  const app = new OpenAPIHono<AppEnv>()

  // Auth middleware for all /tasks/* routes (shared: sets user, session, drizzleDb)
  app.use('/tasks/*', requireAuth)

  app.openapi(listTasksRoute, async (c) => {
    const user = c.get('user')!
    const { status } = c.req.valid('query')
    const db = c.get('drizzleDb')
    const tasks = await listTasks(db, user.id, status)
    return c.json({ tasks, taskCount: tasks.length })
  })

  app.openapi(createTaskRoute, async (c) => {
    const user = c.get('user')!
    const data = c.req.valid('json')
    const db = c.get('drizzleDb')
    const task = await createTask(db, user.id, data)
    return c.json(task)
  })

  app.openapi(getTaskRoute, async (c) => {
    const user = c.get('user')!
    const { id } = c.req.valid('param')
    const db = c.get('drizzleDb')
    const task = await getTask(db, user.id, id)
    if (!task) return c.json({ error: 'Not found' }, 404)
    return c.json(task)
  })

  app.openapi(updateTaskRoute, async (c) => {
    const user = c.get('user')!
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    const db = c.get('drizzleDb')
    const task = await updateTask(db, user.id, id, data)
    if (!task) return c.json({ error: 'Not found' }, 404)
    return c.json(task)
  })

  app.openapi(deleteTaskRoute, async (c) => {
    const user = c.get('user')!
    const { id } = c.req.valid('param')
    const db = c.get('drizzleDb')
    await deleteTask(db, user.id, id)
    return c.json({ success: true })
  })

  return app
}
