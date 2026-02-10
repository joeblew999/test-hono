import { z } from 'zod'
import { getCount, increment, decrement, setCount, resetCount } from '../../queries'
import { jsonResult } from './types'
import type { McpContext } from './types'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function addCounterTools(mcp: McpServer, ctx: McpContext) {
  mcp.tool('counter_get', 'Get the current counter value', {}, async () => {
    const count = await getCount(ctx.db)
    return jsonResult({ count })
  })

  mcp.tool('counter_increment', 'Increment the counter by 1', {}, async () => {
    const count = await increment(ctx.db)
    return jsonResult({ count })
  })

  mcp.tool('counter_decrement', 'Decrement the counter by 1', {}, async () => {
    const count = await decrement(ctx.db)
    return jsonResult({ count })
  })

  mcp.tool('counter_set', 'Set counter to a specific value', {
    value: z.number().int().describe('Value to set the counter to'),
  }, async ({ value }) => {
    const count = await setCount(ctx.db, value)
    return jsonResult({ count })
  })

  mcp.tool('counter_reset', 'Reset counter to 0', {}, async () => {
    await resetCount(ctx.db)
    return jsonResult({ count: 0 })
  })
}
