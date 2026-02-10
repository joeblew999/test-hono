import { z } from 'zod'
import { listTasks, createTask, getTask, updateTask, deleteTask } from '../task-logic'
import { UpdateTaskSchema, TaskFilterSchema } from '../../validators'
import { jsonResult, errorResult } from './types'
import type { McpContext } from './types'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function addTasksTools(mcp: McpServer, ctx: McpContext) {
  mcp.tool('tasks_list', 'List tasks for the authenticated user', {
    status: TaskFilterSchema.shape.status,
  }, async ({ status }) => {
    const tasks = await listTasks(ctx.drizzleDb, ctx.userId, status)
    return jsonResult({ tasks, taskCount: tasks.length })
  })

  mcp.tool('tasks_create', 'Create a new task', {
    title: z.string().min(1).describe('Title of the task'),
    description: z.string().optional().describe('Optional task description'),
  }, async ({ title, description }) => {
    const task = await createTask(ctx.drizzleDb, ctx.userId, { taskTitle: title, taskDesc: description })
    return jsonResult(task)
  })

  mcp.tool('tasks_get', 'Get a task by ID', {
    taskId: z.number().int().describe('Task ID'),
  }, async ({ taskId }) => {
    const task = await getTask(ctx.drizzleDb, ctx.userId, taskId)
    if (!task) return errorResult('Task not found')
    return jsonResult(task)
  })

  mcp.tool('tasks_update', 'Update a task', {
    taskId: z.number().int().describe('Task ID to update'),
    ...UpdateTaskSchema.shape,
  }, async ({ taskId, ...data }) => {
    const task = await updateTask(ctx.drizzleDb, ctx.userId, taskId, data)
    if (!task) return errorResult('Task not found')
    return jsonResult(task)
  })

  mcp.tool('tasks_delete', 'Delete a task', {
    taskId: z.number().int().describe('Task ID to delete'),
  }, async ({ taskId }) => {
    await deleteTask(ctx.drizzleDb, ctx.userId, taskId)
    return jsonResult({ deleted: taskId })
  })
}
