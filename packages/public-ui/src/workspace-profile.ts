export type WorkspaceProfile = {
  name: string
  avatar: string
}

const EVENT = 'biu:workspace-profile'
const EMPTY: WorkspaceProfile = { name: '', avatar: '' }
let cached: WorkspaceProfile = EMPTY

function sameProfile(a: WorkspaceProfile, b: WorkspaceProfile) {
  return a.name === b.name && a.avatar === b.avatar
}

function parse(raw: unknown): WorkspaceProfile {
  const rec = raw && typeof raw === 'object' ? (raw as Partial<WorkspaceProfile>) : {}
  return {
    name: String(rec.name ?? '').trim().slice(0, 40),
    avatar: String(rec.avatar ?? '').trim(),
  }
}

function remember(next: WorkspaceProfile) {
  if (sameProfile(cached, next)) return cached
  cached = next
  return cached
}

export function readWorkspaceProfile(): WorkspaceProfile {
  return cached
}

export function writeWorkspaceProfile(next: WorkspaceProfile) {
  const saved = remember({
    name: next.name.trim().slice(0, 40),
    avatar: next.avatar.trim(),
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
  return saved
}

export function subscribeWorkspaceProfile(onStore: () => void) {
  if (typeof window === 'undefined') return () => {}
  const onChange = () => onStore()
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
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
    const next = parse(data)
    const current = readWorkspaceProfile()
    if (sameProfile(current, next)) return current
    return writeWorkspaceProfile(next)
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
    /* memory copy is enough for this session */
  }
  return saved
}
