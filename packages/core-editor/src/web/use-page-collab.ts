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
    let wait = 0
    void (async () => {
      try {
        const me = (await fetch('/api/members/me').then((res) => res.json())) as {
          member: CollabMember | null
          token?: string
          empty?: boolean
        }
        if (cancelled) return
        if (!me.member && me.empty) {
          const created = (await fetch('/api/members/bootstrap', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: '你' }),
          }).then((res) => res.json())) as { member?: CollabMember; token?: string }
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
  }, [pageId, ydoc])

  useLayoutEffect(() => {
    return () => {
      provider?.destroy()
    }
  }, [provider])

  return { ydoc, provider, member, ready }
}
