import { eq } from 'drizzle-orm'
import { taskTable } from '../schema'
import { createCrud } from './crud'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

const crud = createCrud({ table: taskTable })
type TaskRow = typeof taskTable.$inferSelect

export async function listTasks(db: DrizzleD1Database, userId: string, status?: string): Promise<TaskRow[]> {
  const filter = status ? eq(taskTable.status, status as any) : undefined
  return crud.list(db, userId, filter)
}

export async function createTask(db: DrizzleD1Database, userId: string, data: { taskTitle: string; taskDesc?: string }): Promise<TaskRow> {
  return crud.create(db, userId, {
    title: data.taskTitle,
    description: data.taskDesc || null,
  })
}

export async function getTask(db: DrizzleD1Database, userId: string, taskId: number): Promise<TaskRow | undefined> {
  return crud.get(db, userId, taskId)
}

export async function updateTask(db: DrizzleD1Database, userId: string, taskId: number, data: { title?: string; description?: string; status?: string }): Promise<TaskRow | undefined> {
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (data.title !== undefined) updates.title = data.title
  if (data.description !== undefined) updates.description = data.description
  if (data.status !== undefined) updates.status = data.status
  return crud.update(db, userId, taskId, updates)
}

export async function deleteTask(db: DrizzleD1Database, userId: string, taskId: number): Promise<void> {
  return crud.del(db, userId, taskId)
}

export async function clearTasks(db: DrizzleD1Database, userId: string): Promise<void> {
  return crud.clear(db, userId)
}
