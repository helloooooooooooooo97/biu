import { useEffect, useState } from 'react'
import type { CollabGuest } from './collab-user.ts'

export type PresenceViewer = { id: string; color: string; name?: string }

export function usePagePresence(pageId: string, guest: CollabGuest): PresenceViewer[] {
  const [viewers, setViewers] = useState<PresenceViewer[]>([{ id: guest.id, color: guest.color, name: guest.name }])

  useEffect(() => {
    let cancelled = false
    const apply = (rows: PresenceViewer[]) => {
      if (cancelled) return
      const next = rows.length ? rows : [{ id: guest.id, color: guest.color, name: guest.name }]
      setViewers(next)
    }
    const beat = () => {
      void fetch('/api/collab/presence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageId, guestId: guest.id, color: guest.color, name: guest.name }),
      })
        .then((res) => res.json())
        .then((body: { viewers?: PresenceViewer[] }) => apply(body.viewers ?? []))
        .catch(() => apply([{ id: guest.id, color: guest.color, name: guest.name }]))
    }
    const onPush = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId?: string; viewers?: PresenceViewer[] }>).detail
      if (detail?.pageId !== pageId || !detail.viewers) return
      apply(detail.viewers)
    }
    beat()
    const timer = window.setInterval(beat, 400)
    window.addEventListener('biu:presence', onPush)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('biu:presence', onPush)
    }
  }, [pageId, guest.id, guest.color, guest.name])

  return viewers
}
