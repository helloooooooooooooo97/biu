export const WORKSPACE_KEY = 'biu.workspaceId'
const WORKSPACE_EVENT = 'biu:workspace'

export function readWorkspaceId() {
  if (typeof sessionStorage !== 'undefined') {
    const current = sessionStorage.getItem(WORKSPACE_KEY)
    if (current) return current
  }
  if (typeof localStorage !== 'undefined') return localStorage.getItem(WORKSPACE_KEY) ?? ''
  return ''
}

export function writeWorkspaceId(id: string) {
  if (!id || typeof window === 'undefined') return
  sessionStorage.setItem(WORKSPACE_KEY, id)
  localStorage.setItem(WORKSPACE_KEY, id)
  window.dispatchEvent(new Event(WORKSPACE_EVENT))
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

/** 左上角写出当前空间之前，其它接口先停住。 */
export function waitForDisplayedWorkspace() {
  const existing = readWorkspaceId()
  if (existing) return Promise.resolve(existing)
  return new Promise<string>((resolve) => {
    const finish = () => {
      const id = readWorkspaceId()
      if (!id) return
      window.removeEventListener(WORKSPACE_EVENT, finish)
      resolve(id)
    }
    window.addEventListener(WORKSPACE_EVENT, finish)
    finish()
  })
}

let installed = false

export function installTenantFetch() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = localStorage.getItem('biu.account.token') ?? ''
    const url = requestUrl(input)
    let workspaceId = readWorkspaceId()
    if (token && !workspaceId && !isAccountApi(url)) workspaceId = await waitForDisplayedWorkspace()
    if (!token && !workspaceId) return originalFetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
    if (workspaceId && !headers.has('x-biu-workspace-id')) headers.set('x-biu-workspace-id', workspaceId)
    return originalFetch(input, { ...init, headers })
  }
}
