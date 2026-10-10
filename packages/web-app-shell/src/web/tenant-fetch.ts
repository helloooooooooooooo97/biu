export const WORKSPACE_KEY = 'biu.workspaceId'

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
