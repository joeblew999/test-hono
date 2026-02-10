import { API } from '../constants'

/** Parse browser name from User-Agent string. */
export function parseBrowser(ua: string | null | undefined): string {
  if (!ua) return 'Unknown'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera'
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome'
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari'
  if (ua.includes('curl/')) return 'curl'
  return 'Unknown'
}

/** Parse OS name from User-Agent string. */
export function parseOS(ua: string | null | undefined): string {
  if (!ua) return 'Unknown'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) return 'macOS'
  if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  if (ua.includes('CrOS')) return 'ChromeOS'
  return 'Unknown'
}

export type SessionInfo = {
  id: string
  token: string
  ipAddress: string | null
  userAgent: string | null
  browser: string
  os: string
  lastActive: number
  createdAt: number
  isCurrent: boolean
}

/** Map a Better Auth session object to our display info. */
export function formatSessionInfo(
  session: { id: string; token: string; ipAddress?: string | null; userAgent?: string | null; updatedAt: Date; createdAt: Date },
  currentSessionId: string,
): SessionInfo {
  return {
    id: session.id,
    token: session.token,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    browser: parseBrowser(session.userAgent),
    os: parseOS(session.userAgent),
    lastActive: Math.floor(session.updatedAt.getTime() / 1000),
    createdAt: Math.floor(session.createdAt.getTime() / 1000),
    isCurrent: session.id === currentSessionId,
  }
}

/** Render a session list item for Datastar fragment patching. */
export function renderSessionItem(s: SessionInfo): string {
  const deviceLabel = `${s.browser} on ${s.os}`
  const ipDisplay = s.ipAddress || 'Unknown IP'
  const lastActive = new Date(s.lastActive * 1000).toLocaleString()
  const currentBadge = s.isCurrent
    ? '<span class="badge badge-success badge-xs ml-2">This device</span>'
    : ''
  const revokeBtn = s.isCurrent
    ? ''
    : `<button class="btn btn-xs btn-ghost text-error" data-on:click="$revokeSessionToken = '${s.token}'; @post('${API.SESSIONS_REVOKE}')">&times;</button>`

  return `<li id="session-${s.id}" class="session-item flex items-center gap-3 px-3 py-2.5 border-b border-base-300 last:border-b-0"><div class="flex-1"><div class="text-sm font-medium">${deviceLabel}${currentBadge}</div><div class="text-xs text-base-content/50">${ipDisplay} &middot; Last active: ${lastActive}</div></div>${revokeBtn}</li>`
}
