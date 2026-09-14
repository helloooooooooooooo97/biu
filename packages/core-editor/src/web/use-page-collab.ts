import { useEffect, useLayoutEffect, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { collabCaretUser, loadOrCreateGuest, type CollabGuest } from './collab-user.ts'

export type CollabMember = { id: string; name: string; role: string; color?: string }

export type PageCollab = {
  ydoc: Y.Doc
  provider: HocuspocusProvider | null
  member: CollabMember | null
  guest: CollabGuest
  ready: boolean
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/collaboration`
}

export function usePageCollab(pageId: string): PageCollab {
  const [ydoc] = useState(() => new Y.Doc())
  const [guest] = useState(() => loadOrCreateGuest())
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [member, setMember] = useState<CollabMember | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let wait = 0
    void (async () => {
      const caret = collabCaretUser(guest)
      try {
        const me = (await fetch('/api/members/me').then((res) => res.json())) as {
          member: CollabMember | null
          token?: string
        }
        if (cancelled) return
        if (me.token && me.member) {
          setMember({ ...me.member, name: guest.id, color: caret.color })
          return me.token
        }
        const created = (await fetch('/api/members/guest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ guestId: guest.id }),
        }).then((res) => res.json())) as { member?: CollabMember; token?: string }
        if (cancelled) return
        setMember(created.member ? { ...created.member, name: guest.id, color: caret.color } : { id: guest.id, name: guest.id, role: 'editor', color: caret.color })
        return created.token ?? ''
      } catch {
        setMember({ id: guest.id, name: guest.id, role: 'editor', color: caret.color })
        return ''
      }
    })().then((token) => {
      if (cancelled) return
      if (!token) {
        setReady(true)
        return
      }
      const next = new HocuspocusProvider({
        url: wsUrl(),
        name: `page.${pageId}`,
        document: ydoc,
        token,
      })
      next.setAwarenessField('user', collabCaretUser(guest))
      let done = false
      const finish = () => {
        if (cancelled || done) return
        done = true
        setProvider(next)
        setReady(true)
      }
      next.on('synced', finish)
      next.on('authenticationFailed', finish)
      wait = window.setTimeout(finish, 4000)
    })
    return () => {
      cancelled = true
      if (wait) window.clearTimeout(wait)
    }
  }, [pageId, ydoc, guest])

  useLayoutEffect(() => {
    return () => {
      provider?.destroy()
    }
  }, [provider])

  return { ydoc, provider, member, guest, ready }
}
