import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { userTable } from '../../schema'
import { jsonResult, errorResult } from './types'
import type { McpContext } from './types'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function addAdminTools(mcp: McpServer, ctx: McpContext) {
  mcp.tool('admin_list_users', 'List all users (admin only)', {
    limit: z.number().int().optional().describe('Max users to return (default 50)'),
  }, async ({ limit }) => {
    const caller = await ctx.drizzleDb.select().from(userTable).where(eq(userTable.id, ctx.userId)).get()
    if (!caller || caller.role !== 'admin') {
      return errorResult('Forbidden: admin role required')
    }
    const users = await ctx.drizzleDb.select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      banned: userTable.banned,
    }).from(userTable).limit(limit || 50).all()
    return jsonResult({ users, total: users.length })
  })

  mcp.tool('admin_set_role', 'Set a user role (admin only)', {
    userId: z.string().describe('Target user ID'),
    role: z.enum(['user', 'admin']).describe('Role to assign'),
  }, async ({ userId, role }) => {
    const caller = await ctx.drizzleDb.select().from(userTable).where(eq(userTable.id, ctx.userId)).get()
    if (!caller || caller.role !== 'admin') {
      return errorResult('Forbidden: admin role required')
    }
    const updated = await ctx.drizzleDb.update(userTable).set({ role }).where(eq(userTable.id, userId)).returning().get()
    if (!updated) return errorResult('User not found')
    return jsonResult({ id: updated.id, name: updated.name, role: updated.role })
  })
}
