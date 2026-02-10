/**
 * Generic CRUD factory for user-scoped Drizzle entities.
 *
 * Usage:
 *   const crud = createCrud({ table: noteTable, orderBy: desc(noteTable.createdAt) })
 *   const notes = await crud.list(db, userId)
 */
import { eq, and, type SQL } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core'

type CrudConfig<TTable extends SQLiteTableWithColumns<any>> = {
  table: TTable
  /** Optional ordering for list queries (e.g. desc(noteTable.createdAt)) */
  orderBy?: SQL | SQL[]
}

/**
 * Creates standard CRUD operations scoped by userId.
 * All entities in this codebase have `id` (integer PK) and `userId` (text FK) columns.
 */
export function createCrud<TTable extends SQLiteTableWithColumns<any>>(
  config: CrudConfig<TTable>
) {
  const { table, orderBy } = config
  // Drizzle's generic table type doesn't expose column names statically,
  // so we use `as any` to access the standard id/userId columns.
  const idCol = (table as any).id
  const userIdCol = (table as any).userId

  type Row = TTable['$inferSelect']

  async function list(
    db: DrizzleD1Database,
    userId: string,
    filter?: SQL,
  ): Promise<Row[]> {
    let query = db.select().from(table).where(
      filter ? and(eq(userIdCol, userId), filter) : eq(userIdCol, userId)
    ) as any
    if (orderBy) {
      query = query.orderBy(...(Array.isArray(orderBy) ? orderBy : [orderBy]))
    }
    return query.all()
  }

  async function create(
    db: DrizzleD1Database,
    userId: string,
    values: Partial<TTable['$inferInsert']>,
  ): Promise<Row> {
    const [row] = await db.insert(table).values({
      ...values,
      userId,
    } as any).returning()
    return row! as Row
  }

  async function get(
    db: DrizzleD1Database,
    userId: string,
    id: number,
  ): Promise<Row | undefined> {
    return db.select().from(table)
      .where(and(eq(idCol, id), eq(userIdCol, userId)))
      .get() as Promise<Row | undefined>
  }

  async function update(
    db: DrizzleD1Database,
    userId: string,
    id: number,
    values: Record<string, unknown>,
  ): Promise<Row | undefined> {
    const [row] = await db.update(table)
      .set(values as any)
      .where(and(eq(idCol, id), eq(userIdCol, userId)))
      .returning()
    return row as Row | undefined
  }

  async function del(
    db: DrizzleD1Database,
    userId: string,
    id: number,
  ): Promise<void> {
    await db.delete(table)
      .where(and(eq(idCol, id), eq(userIdCol, userId)))
  }

  async function clear(
    db: DrizzleD1Database,
    userId: string,
  ): Promise<void> {
    await db.delete(table).where(eq(userIdCol, userId))
  }

  return { list, create, get, update, del, clear }
}
