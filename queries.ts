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
