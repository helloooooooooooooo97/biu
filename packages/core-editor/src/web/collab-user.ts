const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777']

export function colorForId(id: string) {
  let n = 0
  for (const ch of id) n = (n + ch.charCodeAt(0)) % COLORS.length
  return COLORS[n]
}

/** 身份未知时光标旁写「你」，颜色仍按 id 分开，方便 B 看见 A 的位置。 */
export function collabCaretUser(member?: { id?: string; name?: string; color?: string } | null) {
  const name = String(member?.name ?? '').trim() || '你'
  return { name, color: member?.color || colorForId(member?.id || name) }
}
