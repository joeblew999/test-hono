import type { Context } from 'hono'
import { isSSE, respondFragment } from '../sse'
import type { AppEnv, BroadcastConfig } from '../types'

type RespondAfterMutationOptions<T> = {
  c: Context<AppEnv>
  items: T[]
  countKey: string
  selector: string
  renderItem: (item: T) => string
  emptyHtml?: string
  extraSignals?: Record<string, unknown>
  jsonResponse: any
  bc?: BroadcastConfig
}

/** After a mutation (create/update/delete), re-render the list and respond via SSE or JSON.
 *  Handles the full "render list → SSE fragment / JSON + broadcast" pattern. */
export function respondAfterMutation<T>(opts: RespondAfterMutationOptions<T>) {
  const { c, items, countKey, selector, renderItem, emptyHtml, extraSignals, jsonResponse, bc } = opts
  const count = items.length
  const html = items.map(renderItem).join('') || emptyHtml || ''

  if (isSSE(c)) {
    return respondFragment(c, {
      signals: { [countKey]: count, ...extraSignals },
      fragments: [{ selector, html, mode: 'inner' }],
    })
  }

  bc?.broadcast({ [countKey]: count })
  return c.json(jsonResponse)
}
