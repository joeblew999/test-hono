import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { sessionTable } from '../../schema'
import { parseBrowser, parseOS } from '../session-logic'
import { jsonResult, errorResult } from './types'
import type { McpContext } from './types'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function addSessionsTools(mcp: McpServer, ctx: McpContext) {
  mcp.tool('sessions_list', 'List all active sessions for the authenticated user', {}, async () => {
    const rows = await ctx.drizzleDb.select().from(sessionTable)
      .where(eq(sessionTable.userId, ctx.userId))
      .all()
    const sessions = rows.map(row => ({
      id: row.id,
      token: row.token,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      browser: parseBrowser(row.userAgent),
      os: parseOS(row.userAgent),
      lastActive: row.updatedAt ? Math.floor(row.updatedAt.getTime() / 1000) : null,
      createdAt: row.createdAt ? Math.floor(row.createdAt.getTime() / 1000) : null,
    }))
    return jsonResult({ sessions, sessionCount: sessions.length })
  })

  mcp.tool('sessions_revoke', 'Revoke (log out) a specific session by token', {
    sessionToken: z.string().min(1).describe('Session token to revoke'),
  }, async ({ sessionToken }) => {
    const [deleted] = await ctx.drizzleDb.delete(sessionTable)
      .where(eq(sessionTable.token, sessionToken))
      .returning()
    if (!deleted) return errorResult('Session not found')
    return jsonResult({ revoked: deleted.id })
  })

  mcp.tool('sessions_revoke_all', 'Revoke all sessions except the current MCP session', {}, async () => {
    const deleted = await ctx.drizzleDb.delete(sessionTable)
      .where(eq(sessionTable.userId, ctx.userId))
      .returning()
    return jsonResult({ revoked: deleted.length })
  })
}
