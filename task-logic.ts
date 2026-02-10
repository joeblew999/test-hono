import { eq, and } from 'drizzle-orm'
import { taskTable } from './schema'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

type TaskRow = typeof taskTable.$inferSelect

export async function listTasks(db: DrizzleD1Database, userId: string, status?: string): Promise<TaskRow[]> {
  if (status) {
    return db.select().from(taskTable).where(
      and(eq(taskTable.userId, userId), eq(taskTable.status, status as any))
    ).all()
  }
  return db.select().from(taskTable).where(eq(taskTable.userId, userId)).all()
}

export async function createTask(db: DrizzleD1Database, userId: string, data: { title: string; description?: string }): Promise<TaskRow> {
  const [task] = await db.insert(taskTable).values({
    userId,
    title: data.title,
    description: data.description ?? null,
  }).returning()
  return task
}

export async function getTask(db: DrizzleD1Database, userId: string, taskId: number): Promise<TaskRow | undefined> {
  return db.select().from(taskTable)
    .where(and(eq(taskTable.id, taskId), eq(taskTable.userId, userId)))
    .get()
}

export async function updateTask(db: DrizzleD1Database, userId: string, taskId: number, data: { title?: string; description?: string; status?: string }): Promise<TaskRow | undefined> {
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (data.title !== undefined) updates.title = data.title
  if (data.description !== undefined) updates.description = data.description
  if (data.status !== undefined) updates.status = data.status

  const [task] = await db.update(taskTable)
    .set(updates)
    .where(and(eq(taskTable.id, taskId), eq(taskTable.userId, userId)))
    .returning()
  return task
}

export async function deleteTask(db: DrizzleD1Database, userId: string, taskId: number): Promise<void> {
  await db.delete(taskTable)
    .where(and(eq(taskTable.id, taskId), eq(taskTable.userId, userId)))
}

export async function clearTasks(db: DrizzleD1Database, userId: string): Promise<void> {
  await db.delete(taskTable).where(eq(taskTable.userId, userId))
}
