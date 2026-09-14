export const PRESENCE_CHANNEL = 'presence'
const TTL_MS = 12_000

export type Viewer = {
  id: string
  color: string
  at: number
  from?: number
}

const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777']

export function colorForId(id: string) {
  let n = 0
  for (const ch of id) n = (n + ch.charCodeAt(0)) % COLORS.length
  return COLORS[n]
}

export class PresenceStore {
  private pages = new Map<string, Map<string, Viewer>>()

  touch(pageId: string, id: string, color?: string, from?: number) {
    if (!pageId || !id) return this.list(pageId)
    let room = this.pages.get(pageId)
    if (!room) {
      room = new Map()
      this.pages.set(pageId, room)
    }
    const caret = Number.isFinite(from) ? Number(from) : undefined
    room.set(id, { id, color: color || colorForId(id), at: Date.now(), from: caret })
    return this.list(pageId)
  }

  list(pageId: string) {
    this.prune()
    const room = this.pages.get(pageId)
    if (!room) return [] as Viewer[]
    return [...room.values()].sort((a, b) => a.at - b.at)
  }

  private prune() {
    const now = Date.now()
    for (const [pageId, room] of this.pages) {
      for (const [id, viewer] of room) {
        if (now - viewer.at > TTL_MS) room.delete(id)
      }
      if (!room.size) this.pages.delete(pageId)
    }
  }
}
