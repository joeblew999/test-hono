import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { CreateTaskSchema, UpdateTaskSchema, TaskSchema, TaskListSchema, TaskFilterSchema, ErrorSchema, SuccessSchema, TasksResetSchema } from '../validators'
import { listTasks, createTask, getTask, updateTask, deleteTask, clearTasks } from '../lib/task-logic'
import { isSSE, respondFragment, respond } from '../sse'
import { requireAuth } from '../lib/auth'
import { API, SEL } from '../constants'
import type { AppEnv, BroadcastConfig } from '../types'

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
    params: z.object({ id: z.coerce.number().int() }),
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
    params: z.object({ id: z.coerce.number().int() }),
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
    params: z.object({ id: z.coerce.number().int() }),
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

const resetTasksRoute = createRoute({
  method: 'post',
  path: '/tasks/reset',
  tags: ['Tasks'],
  summary: 'Clear all tasks for authenticated user',
  description: 'Deletes all tasks. Used for test isolation.',
  responses: {
    200: {
      content: { 'application/json': { schema: TasksResetSchema } },
      description: 'Tasks cleared',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

// --- Helpers ---

type TaskRow = { id: number; title: string; status: string; description: string | null }

function renderTaskItem(task: TaskRow): string {
  const statusOptions = ['pending', 'in_progress', 'completed']
  const optionsHtml = statusOptions.map(s =>
    `<option value="${s}"${task.status === s ? ' selected' : ''}>${s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}</option>`
  ).join('')
  return `<li id="task-${task.id}" class="task-item flex items-center gap-3 px-3 py-2.5 border-b border-base-300 last:border-b-0"><span class="task-title flex-1 text-sm">${task.title}</span><select class="select select-xs select-bordered" data-on:change="$status = $evt.target.value; @patch('${API.taskUpdate(task.id)}')">${optionsHtml}</select><button class="note-delete btn btn-xs btn-ghost text-error" data-on:click="@delete('${API.taskDelete(task.id)}')">&times;</button></li>`
}

// --- Handlers ---

export default (bc?: BroadcastConfig) => {
  const app = new OpenAPIHono<AppEnv>()

  // Auth middleware for all /tasks/* routes (shared: sets user, session, drizzleDb)
  app.use('/tasks/*', requireAuth)

  app.openapi(listTasksRoute, async (c) => {
    const user = c.get('user')!
    const { status } = c.req.valid('query')
    const db = c.get('drizzleDb')
    const tasks = await listTasks(db, user.id, status)
    const taskCount = tasks.length

    if (isSSE(c)) {
      const html = tasks.map(renderTaskItem).join('') || '<li class="note-empty text-center text-base-content/50 text-sm p-3">No tasks yet</li>'
      return respondFragment(c, {
        signals: { taskCount },
        fragments: [{ selector: SEL.TASK_LIST, html, mode: 'inner' }],
      })
    }
    return c.json({ tasks, taskCount })
  })

  app.openapi(createTaskRoute, async (c) => {
    const user = c.get('user')!
    const data = c.req.valid('json')
    const db = c.get('drizzleDb')
    await createTask(db, user.id, data)
    // Re-fetch full list (same pattern as notes)
    const tasks = await listTasks(db, user.id)
    const taskCount = tasks.length
    const html = tasks.map(renderTaskItem).join('')

    if (isSSE(c)) {
      return respondFragment(c, {
        signals: { taskCount, taskTitle: '', taskDesc: '', taskError: '' },
        fragments: [{ selector: SEL.TASK_LIST, html, mode: 'inner' }],
      })
    }

    bc?.broadcast({ taskCount })
    return c.json({ tasks, taskCount })
  })

  // @ts-expect-error — Hono OpenAPI intersects 200+401+404; 401 handled by requireAuth middleware
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

    // Re-fetch full list for SSE re-render
    const tasks = await listTasks(db, user.id)
    const taskCount = tasks.length
    const html = tasks.map(renderTaskItem).join('') || '<li class="note-empty text-center text-base-content/50 text-sm p-3">No tasks yet</li>'

    if (isSSE(c)) {
      return respondFragment(c, {
        signals: { taskCount },
        fragments: [{ selector: SEL.TASK_LIST, html, mode: 'inner' }],
      })
    }

    bc?.broadcast({ taskCount })
    return c.json(task)
  })

  app.openapi(deleteTaskRoute, async (c) => {
    const user = c.get('user')!
    const { id } = c.req.valid('param')
    const db = c.get('drizzleDb')
    await deleteTask(db, user.id, id)

    // Re-fetch full list for SSE re-render
    const tasks = await listTasks(db, user.id)
    const taskCount = tasks.length
    const html = tasks.map(renderTaskItem).join('') || '<li class="note-empty text-center text-base-content/50 text-sm p-3">No tasks yet</li>'

    if (isSSE(c)) {
      return respondFragment(c, {
        signals: { taskCount },
        fragments: [{ selector: SEL.TASK_LIST, html, mode: 'inner' }],
      })
    }

    bc?.broadcast({ taskCount })
    return c.json({ success: true })
  })

  app.openapi(resetTasksRoute, async (c) => {
    const user = c.get('user')!
    const db = c.get('drizzleDb')
    await clearTasks(db, user.id)
    bc?.broadcast({ taskCount: 0 })
    return respond(c, { taskCount: 0 })
  })

  return app
}
