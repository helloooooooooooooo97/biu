export type WorkspaceProfile = {
  name: string
  avatar: string
}

const KEY = 'biu.workspace-profile'
const EVENT = 'biu:workspace-profile'
const EMPTY: WorkspaceProfile = { name: '', avatar: '' }

function parse(raw: string | null): WorkspaceProfile {
  try {
    const rec = JSON.parse(raw || '') as Partial<WorkspaceProfile>
    return {
      name: String(rec.name ?? '').trim().slice(0, 40),
      avatar: String(rec.avatar ?? '').trim(),
    }
  } catch {
    return { ...EMPTY }
  }
}

export function readWorkspaceProfile(): WorkspaceProfile {
  if (typeof localStorage === 'undefined') return { ...EMPTY }
  return parse(localStorage.getItem(KEY))
}

export function writeWorkspaceProfile(next: WorkspaceProfile) {
  const saved: WorkspaceProfile = {
    name: next.name.trim().slice(0, 40),
    avatar: next.avatar.trim(),
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(saved))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
  return saved
}

export function subscribeWorkspaceProfile(onStore: () => void) {
  if (typeof window === 'undefined') return () => {}
  const onChange = () => onStore()
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function profileDisplayName(profile = readWorkspaceProfile()) {
  return profile.name.trim() || '用户'
}

export async function hydrateWorkspaceProfile() {
  try {
    const res = await fetch('/api/profile')
    if (!res.ok) return readWorkspaceProfile()
    const data = (await res.json()) as Partial<WorkspaceProfile>
    return writeWorkspaceProfile({
      name: String(data.name ?? ''),
      avatar: String(data.avatar ?? ''),
    })
  } catch {
    return readWorkspaceProfile()
  }
}

export async function persistWorkspaceProfile(next: WorkspaceProfile) {
  const saved = writeWorkspaceProfile(next)
  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(saved),
    })
  } catch {
    /* local copy is enough for this session */
  }
  return saved
}
