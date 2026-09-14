import type { Context } from 'cordis'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { MemberShare } from './member-share.tsx'

export const name = 'core-collab-ui'
export const inject = ['databaseUi']

function consumeInviteFromLocation() {
  if (typeof location === 'undefined') return
  const params = new URLSearchParams(location.search)
  const token = params.get('token')
  if (!token) return
  if (location.pathname !== '/join' && !params.has('invite')) return
  void fetch('/api/members/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, name: '同事' }),
  }).then((res) => {
    if (!res.ok) return
    history.replaceState(null, '', '/')
    location.reload()
  })
}

export function apply(ctx: Context) {
  consumeInviteFromLocation()
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/members', { Actions: MemberShare, DetailTools: MemberShare }).dispose)
  const snapshot = ctx.get('snapshot') as { onMessage?: (type: string, handler: (payload: unknown) => void) => () => void } | undefined
  ctx.effect(() => {
    if (!snapshot?.onMessage) return () => undefined
    return snapshot.onMessage('presence', (payload) => {
      window.dispatchEvent(new CustomEvent('biu:presence', { detail: payload }))
    })
  })
}
