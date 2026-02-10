import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getCount, increment, decrement, setCount, resetCount, listNotes, addNote, deleteNote } from '../queries'
import { listTasks, createTask, getTask, updateTask, deleteTask } from './task-logic'
import { userTable } from '../schema'
import { UpdateTaskSchema, TaskFilterSchema } from '../validators'
import type { Context } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { AppEnv } from '../types'

type McpContext = {
  db: D1Database
  drizzleDb: DrizzleD1Database
  userId: string
}

/** Shared MCP request handler — used by both index.ts (Workers) and server.ts (Bun). */
export async function handleMcpRequest(c: Context<AppEnv>) {
  const user = c.get('user')!
  const db = c.env.DB
  const drizzleDb = c.get('drizzleDb')
  const mcp = createMcpServer({ db, drizzleDb, userId: user.id })
  const transport = new StreamableHTTPTransport()
  await mcp.connect(transport)
  return transport.handleRequest(c)
}

export function createMcpServer(ctx: McpContext) {
  const mcp = new McpServer({
    name: 'test-hono-mcp',
    version: '1.0.0',
  })

  // --- Counter Tools (public data, uses raw D1 via queries.ts) ---

  mcp.tool('counter_get', 'Get the current counter value', {}, async () => {
    const count = await getCount(ctx.db)
    return { content: [{ type: 'text', text: JSON.stringify({ count }) }] }
  })

  mcp.tool('counter_increment', 'Increment the counter by 1', {}, async () => {
    const count = await increment(ctx.db)
    return { content: [{ type: 'text', text: JSON.stringify({ count }) }] }
  })

  mcp.tool('counter_decrement', 'Decrement the counter by 1', {}, async () => {
    const count = await decrement(ctx.db)
    return { content: [{ type: 'text', text: JSON.stringify({ count }) }] }
  })

  mcp.tool('counter_set', 'Set counter to a specific value', {
    value: z.number().int().describe('Value to set the counter to'),
  }, async ({ value }) => {
    const count = await setCount(ctx.db, value)
    return { content: [{ type: 'text', text: JSON.stringify({ count }) }] }
  })

  mcp.tool('counter_reset', 'Reset counter to 0', {}, async () => {
    await resetCount(ctx.db)
    return { content: [{ type: 'text', text: JSON.stringify({ count: 0 }) }] }
  })

  // --- Notes Tools (public data, uses raw D1 via queries.ts) ---

  mcp.tool('notes_list', 'List all notes', {}, async () => {
    const notes = await listNotes(ctx.db)
    return { content: [{ type: 'text', text: JSON.stringify({ notes, noteCount: notes.length }) }] }
  })

  mcp.tool('notes_add', 'Add a new note', {
    text: z.string().min(1).describe('Note text'),
  }, async ({ text }) => {
    const note = await addNote(ctx.db, text)
    return { content: [{ type: 'text', text: JSON.stringify(note) }] }
  })

  mcp.tool('notes_delete', 'Delete a note by ID', {
    id: z.number().int().describe('Note ID to delete'),
  }, async ({ id }) => {
    await deleteNote(ctx.db, id)
    return { content: [{ type: 'text', text: `Deleted note ${id}` }] }
  })

  // --- Tasks Tools (authenticated, uses Drizzle + shared Zod schemas) ---

  mcp.tool('tasks_list', 'List tasks for the authenticated user', {
    status: TaskFilterSchema.shape.status,
  }, async ({ status }) => {
    const tasks = await listTasks(ctx.drizzleDb, ctx.userId, status)
    return { content: [{ type: 'text', text: JSON.stringify({ tasks, taskCount: tasks.length }) }] }
  })

  mcp.tool('tasks_create', 'Create a new task', {
    title: z.string().min(1).describe('Title of the task'),
    description: z.string().optional().describe('Optional task description'),
  }, async ({ title, description }) => {
    const task = await createTask(ctx.drizzleDb, ctx.userId, { taskTitle: title, taskDesc: description })
    return { content: [{ type: 'text', text: JSON.stringify(task) }] }
  })

  mcp.tool('tasks_get', 'Get a task by ID', {
    taskId: z.number().int().describe('Task ID'),
  }, async ({ taskId }) => {
    const task = await getTask(ctx.drizzleDb, ctx.userId, taskId)
    if (!task) return { content: [{ type: 'text', text: 'Task not found' }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] }
  })

  mcp.tool('tasks_update', 'Update a task', {
    taskId: z.number().int().describe('Task ID to update'),
    ...UpdateTaskSchema.shape,
  }, async ({ taskId, ...data }) => {
    const task = await updateTask(ctx.drizzleDb, ctx.userId, taskId, data)
    if (!task) return { content: [{ type: 'text', text: 'Task not found' }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] }
  })

  mcp.tool('tasks_delete', 'Delete a task', {
    taskId: z.number().int().describe('Task ID to delete'),
  }, async ({ taskId }) => {
    await deleteTask(ctx.drizzleDb, ctx.userId, taskId)
    return { content: [{ type: 'text', text: `Deleted task ${taskId}` }] }
  })

  // --- Admin Tools (admin role required, uses Drizzle) ---

  mcp.tool('admin_list_users', 'List all users (admin only)', {
    limit: z.number().int().optional().describe('Max users to return (default 50)'),
  }, async ({ limit }) => {
    const caller = await ctx.drizzleDb.select().from(userTable).where(eq(userTable.id, ctx.userId)).get()
    if (!caller || caller.role !== 'admin') {
      return { content: [{ type: 'text', text: 'Forbidden: admin role required' }], isError: true }
    }
    const users = await ctx.drizzleDb.select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      banned: userTable.banned,
    }).from(userTable).limit(limit || 50).all()
    return { content: [{ type: 'text', text: JSON.stringify({ users, total: users.length }) }] }
  })

  mcp.tool('admin_set_role', 'Set a user role (admin only)', {
    userId: z.string().describe('Target user ID'),
    role: z.enum(['user', 'admin']).describe('Role to assign'),
  }, async ({ userId, role }) => {
    const caller = await ctx.drizzleDb.select().from(userTable).where(eq(userTable.id, ctx.userId)).get()
    if (!caller || caller.role !== 'admin') {
      return { content: [{ type: 'text', text: 'Forbidden: admin role required' }], isError: true }
    }
    const updated = await ctx.drizzleDb.update(userTable).set({ role }).where(eq(userTable.id, userId)).returning().get()
    if (!updated) return { content: [{ type: 'text', text: 'User not found' }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify({ id: updated.id, name: updated.name, role: updated.role }) }] }
  })

  return mcp
}
