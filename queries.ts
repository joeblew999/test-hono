export async function getCount(db: D1Database): Promise<number> {
  const row = await db.prepare(
    'SELECT value FROM counter WHERE id = 1'
  ).first<{ value: number }>()
  return row?.value ?? 0
}

export async function increment(db: D1Database): Promise<number> {
  const row = await db.prepare(
    'UPDATE counter SET value = value + 1 WHERE id = 1 RETURNING value'
  ).first<{ value: number }>()
  return row?.value ?? 0
}

export async function decrement(db: D1Database): Promise<number> {
  const row = await db.prepare(
    'UPDATE counter SET value = value - 1 WHERE id = 1 RETURNING value'
  ).first<{ value: number }>()
  return row?.value ?? 0
}

export async function setCount(db: D1Database, value: number): Promise<number> {
  const row = await db.prepare(
    'UPDATE counter SET value = ? WHERE id = 1 RETURNING value'
  ).bind(value).first<{ value: number }>()
  return row?.value ?? 0
}

export async function resetCount(db: D1Database): Promise<void> {
  await db.prepare('UPDATE counter SET value = 0 WHERE id = 1').run()
}

// --- Notes ---

export type Note = { id: number; text: string; created_at: string }

export async function listNotes(db: D1Database): Promise<Note[]> {
  const { results } = await db.prepare(
    'SELECT id, text, created_at FROM notes ORDER BY created_at DESC'
  ).all<Note>()
  return results
}

export async function addNote(db: D1Database, text: string): Promise<Note> {
  const row = await db.prepare(
    'INSERT INTO notes (text) VALUES (?) RETURNING id, text, created_at'
  ).bind(text).first<Note>()
  return row!
}

export async function deleteNote(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM notes WHERE id = ?').bind(id).run()
}

export async function clearNotes(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM notes').run()
}
