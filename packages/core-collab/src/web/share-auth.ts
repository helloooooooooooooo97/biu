export type ShareAuth = { token: string; pageId: string; role: string; name?: string; guestId?: string }

const KEY = 'biu_share_auth'

export function setShareAuth(auth: ShareAuth) {
  sessionStorage.setItem(KEY, JSON.stringify(auth))
}

export function readShareAuth(): ShareAuth | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ShareAuth
    if (!parsed.token || !parsed.pageId) return null
    return parsed
  } catch {
    return null
  }
}
