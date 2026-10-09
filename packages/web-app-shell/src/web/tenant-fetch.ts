export const WORKSPACE_KEY = 'biu.workspaceId'

let pendingWorkspace: Promise<string> | null = null

export function readWorkspaceId() {
  if (typeof sessionStorage !== 'undefined') {
    const current = sessionStorage.getItem(WORKSPACE_KEY)
    if (current) return current
  }
  if (typeof localStorage !== 'undefined') return localStorage.getItem(WORKSPACE_KEY) ?? ''
  return ''
}

export function writeWorkspaceId(id: string) {
  if (!id) return
  sessionStorage.setItem(WORKSPACE_KEY, id)
  localStorage.setItem(WORKSPACE_KEY, id)
}

export function clearWorkspaceId() {
  sessionStorage.removeItem(WORKSPACE_KEY)
  localStorage.removeItem(WORKSPACE_KEY)
}

export function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export function isAccountApi(url: string) {
  try {
    return new URL(url, 'http://localhost').pathname.startsWith('/api/account/')
  } catch {
    return url.includes('/api/account/')
  }
}

/** 登录了但当前标签还没记下空间时，先问账号的当前空间，再让别的接口带上头。 */
export function resolveWorkspaceId(fetchImpl: typeof fetch, token: string) {
  const existing = readWorkspaceId()
  if (existing || !token) return Promise.resolve(existing)
  if (!pendingWorkspace) {
    pendingWorkspace = (async () => {
      try {
        const res = await fetchImpl('/api/account/active', {
          headers: { authorization: `Bearer ${token}` },
        })
        if (!res.ok) return ''
        const body = (await res.json()) as { workspaceId?: string }
        const id = String(body.workspaceId ?? '')
        if (id) writeWorkspaceId(id)
        return id
      } catch {
        return ''
      } finally {
        pendingWorkspace = null
      }
    })()
  }
  return pendingWorkspace
}
