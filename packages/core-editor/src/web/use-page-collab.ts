import { useEffect, useLayoutEffect, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { collabCaretUser, colorForId, type CollabGuest } from './collab-user.ts'

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
  const [guest, setGuest] = useState<CollabGuest>(() => ({ id: 'pending', color: '#2563eb', name: '' }))
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [member, setMember] = useState<CollabMember | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const me = (await fetch('/api/members/me').then((res) => res.json())) as {
          member: CollabMember | null
          token?: string
        }
        if (cancelled) return
        if (me.token && me.member) {
          const color = colorForId(me.member.id)
          const identity = { id: me.member.id, name: me.member.name, color }
          setMember({ ...me.member, color })
          setGuest(identity)
          return { token: me.token, identity }
        }
      } catch {
        /* not signed in */
      }
      return { token: '', identity: null as CollabGuest | null }
    })().then((result) => {
      if (cancelled) return
      const token = result?.token ?? ''
      const identity = result?.identity
      if (!token || !identity) {
        setReady(true)
        return
      }
      const next = new HocuspocusProvider({
        url: wsUrl(),
        name: `page.${pageId}`,
        document: ydoc,
        token,
      })
      next.setAwarenessField('user', collabCaretUser(identity))
      setProvider(next)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [pageId, ydoc])

  useLayoutEffect(() => {
    return () => {
      provider?.destroy()
    }
  }, [provider])

  return { ydoc, provider, member, guest, ready }
}
