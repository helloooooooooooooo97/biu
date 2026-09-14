const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777']
const GUEST_KEY = 'biu_collab_guest'

export type CollabGuest = { id: string; color: string }

export function colorForId(id: string) {
  let n = 0
  for (const ch of id) n = (n + ch.charCodeAt(0)) % COLORS.length
  return COLORS[n]
}

export function isGuestId(value: string) {
  return /^g_[a-f0-9]{12}$/.test(value)
}

export function newGuestId() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return `g_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** 每台浏览器自己的协同身份，存在 localStorage，不假设已登录用户。 */
export function loadOrCreateGuest(): CollabGuest {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string }
      if (parsed.id && isGuestId(parsed.id)) {
        return { id: parsed.id, color: colorForId(parsed.id) }
      }
    }
  } catch {
    /* ignore */
  }
  const id = newGuestId()
  const guest = { id, color: colorForId(id) }
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ id }))
  } catch {
    /* ignore */
  }
  return guest
}

/** 光标旁显示随机 ID，不用「你」这种默认名。 */
export function collabCaretUser(guest?: { id?: string; name?: string; color?: string } | null) {
  const id = String(guest?.id ?? '').trim()
  const name = isGuestId(id) ? id : String(guest?.name ?? '').trim() || id
  return { name: name || newGuestId(), color: guest?.color || colorForId(name || 'guest') }
}
