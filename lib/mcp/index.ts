import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { addCounterTools } from './counter'
import { addNotesTools } from './notes'
import { addTasksTools } from './tasks'
import { addSessionsTools } from './sessions'
import { addAdminTools } from './admin'
import type { Context } from 'hono'
import type { AppEnv } from '../../types'
import type { McpContext } from './types'

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

  addCounterTools(mcp, ctx)
  addNotesTools(mcp, ctx)
  addTasksTools(mcp, ctx)
  addSessionsTools(mcp, ctx)
  addAdminTools(mcp, ctx)

  return mcp
}
