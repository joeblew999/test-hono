import { desc } from 'drizzle-orm'
import { noteTable } from '../schema'
import { createCrud } from './crud'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

const crud = createCrud({ table: noteTable, orderBy: desc(noteTable.createdAt) })
type NoteRow = typeof noteTable.$inferSelect

export async function listNotes(db: DrizzleD1Database, userId: string): Promise<NoteRow[]> {
  return crud.list(db, userId)
}

export async function createNote(db: DrizzleD1Database, userId: string, data: { newNote: string }): Promise<NoteRow> {
  return crud.create(db, userId, { text: data.newNote })
}

export async function deleteNote(db: DrizzleD1Database, userId: string, noteId: number): Promise<void> {
  return crud.del(db, userId, noteId)
}

export async function clearNotes(db: DrizzleD1Database, userId: string): Promise<void> {
  return crud.clear(db, userId)
}
