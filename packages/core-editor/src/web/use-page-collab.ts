import { useEffect, useLayoutEffect, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'

export type CollabMember = { id: string; name: string; role: string; color?: string }

export type PageCollab = {
  ydoc: Y.Doc
  provider: HocuspocusProvider | null
  member: CollabMember | null
  ready: boolean
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/collaboration`
}

export function usePageCollab(pageId: string): PageCollab {
  const [ydoc] = useState(() => new Y.Doc())
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [member, setMember] = useState<CollabMember | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
      const me = await fetch('/api/members/me').then((res) => res.json()) as { member: CollabMember | null; token?: string; empty?: boolean }
      if (cancelled) return
      if (!me.member && me.empty) {
        const created = await fetch('/api/members/bootstrap', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '用户' }),
        }).then((res) => res.json()) as { member?: CollabMember; token?: string }
        if (cancelled) return
        setMember(created.member ?? null)
        return created.token ?? ''
      }
      setMember(me.member)
      return me.token ?? ''
      } catch {
        return ''
      }
    })().then((token) => {
      if (cancelled || !token) {
        setReady(true)
        return
      }
      const next = new HocuspocusProvider({
        url: wsUrl(),
        name: `page.${pageId}`,
        document: ydoc,
        token,
      })
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

  return { ydoc, provider, member, ready }
}
