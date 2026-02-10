import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { SessionListSchema, RevokeSessionSchema, ErrorSchema, SuccessSchema } from '../validators'
import { formatSessionInfo, renderSessionItem } from '../lib/session-logic'
import type { SessionInfo } from '../lib/session-logic'
import { isSSE, respondFragment, respondPersistentPollingFragments } from '../sse'
import { getAuth, requireAuth } from '../lib/auth'
import { SEL } from '../constants'
import type { AppEnv, BroadcastConfig } from '../types'

// --- Route Definitions ---

const listSessionsRoute = createRoute({
  method: 'get',
  path: '/sessions',
  tags: ['Sessions'],
  summary: 'List active sessions for authenticated user',
  responses: {
    200: {
      content: { 'application/json': { schema: SessionListSchema } },
      description: 'Sessions list',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

const revokeSessionRoute = createRoute({
  method: 'post',
  path: '/sessions/revoke',
  tags: ['Sessions'],
  summary: 'Revoke (log out) another session',
  request: {
    body: { content: { 'application/json': { schema: RevokeSessionSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessSchema } },
      description: 'Session revoked',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Cannot revoke current session',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

// --- Helpers ---

const EMPTY_LIST_HTML = '<li class="note-empty text-center text-base-content/50 text-sm p-3">No other sessions</li>'

async function fetchSessions(c: { env: AppEnv['Bindings']; req: { raw: { headers: Headers } } }, currentSessionId: string) {
  const auth = getAuth(c as any)
  const result = await auth.api.listDeviceSessions({ headers: c.req.raw.headers })
  if (!result) return []
  return (result as any[]).map((entry: any) => formatSessionInfo(entry.session, currentSessionId))
}

function renderList(sessions: SessionInfo[]): string {
  return sessions.map(renderSessionItem).join('') || EMPTY_LIST_HTML
}

// --- Handlers ---

export default (bc?: BroadcastConfig) => {
  const app = new OpenAPIHono<AppEnv>()

  // Auth middleware for all /sessions/* routes
  app.use('/sessions/*', requireAuth)

  app.openapi(listSessionsRoute, async (c) => {
    const session = c.get('session')!
    const sessions = await fetchSessions(c, session.id)
    const sessionCount = sessions.length

    if (isSSE(c)) {
      const html = renderList(sessions)
      const initial = {
        signals: { sessionCount },
        fragments: [{ selector: SEL.SESSION_LIST, html, mode: 'inner' as const }],
      }

      // Workers: poll-based persistent SSE with session validation
      if (!bc?.subscribe) {
        let lastSessionIds = sessions.map(s => s.id).join(',')
        return respondPersistentPollingFragments(c, initial, async () => {
          // Check if current session still exists (revocation detection)
          const auth = getAuth(c)
          const check = await auth.api.getSession({ headers: c.req.raw.headers })
          if (!check) {
            // Session was revoked — send "logged out" fragment
            return {
              signals: { authUser: '', authRole: '', sessionCount: 0 },
              fragments: [{
                selector: SEL.SESSION_LIST,
                html: '<li class="text-center text-error text-sm p-3">Session revoked. Please sign in again.</li>',
                mode: 'inner' as const,
              }],
            }
          }

          const freshSessions = await fetchSessions(c, session.id)
          const freshIds = freshSessions.map(s => s.id).join(',')
          if (freshIds === lastSessionIds) return null
          lastSessionIds = freshIds
          return {
            signals: { sessionCount: freshSessions.length },
            fragments: [{ selector: SEL.SESSION_LIST, html: renderList(freshSessions), mode: 'inner' as const }],
          }
        })
      }

      // Fly.io: one-shot fragment (push-based broadcast)
      return respondFragment(c, initial)
    }

    return c.json({ sessions, sessionCount })
  })

  app.openapi(revokeSessionRoute, async (c) => {
    const session = c.get('session')!
    const { revokeSessionToken } = c.req.valid('json')

    // Prevent revoking own session
    if (revokeSessionToken === session.token) {
      return c.json({ error: 'Cannot revoke your current session. Use Sign Out instead.' }, 400)
    }

    const auth = getAuth(c)
    try {
      await auth.api.revokeDeviceSession({
        body: { sessionToken: revokeSessionToken },
        headers: c.req.raw.headers,
      })
    } catch {
      return c.json({ error: 'Session not found or already revoked' }, 400)
    }

    // Re-fetch sessions for SSE re-render
    const sessions = await fetchSessions(c, session.id)
    const sessionCount = sessions.length

    if (isSSE(c)) {
      return respondFragment(c, {
        signals: { sessionCount, revokeSessionToken: '' },
        fragments: [{ selector: SEL.SESSION_LIST, html: renderList(sessions), mode: 'inner' }],
      })
    }

    return c.json({ success: true })
  })

  return app
}
