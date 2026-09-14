const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777']

export type CollabGuest = { id: string; color: string; name?: string }

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

export function loadOrCreateGuest(): CollabGuest {
  const id = newGuestId()
  return { id, color: colorForId(id), name: id }
}

/** 光标旁只显示一次姓名。 */
export function collabCaretUser(guest?: { id?: string; name?: string; color?: string } | null) {
  const name = String(guest?.name ?? '').trim() || String(guest?.id ?? '').trim()
  return { name: name || '成员', color: guest?.color || colorForId(name || '成员') }
}
