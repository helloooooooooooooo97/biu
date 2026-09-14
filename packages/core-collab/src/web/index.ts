import type { Context } from 'cordis'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import type { SlotsService } from '@biu/web-slots'
import { AuthGate, AccountChip } from './member-auth.tsx'
import { membersChrome } from './member-chrome.tsx'
import { MEMBER_AUTH_STYLE } from './member-auth-style.ts'

export const name = 'core-collab-ui'
export const inject = ['databaseUi', 'slots']

function ensureAuthStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById('member-auth-style')) return
  const el = document.createElement('style')
  el.id = 'member-auth-style'
  el.textContent = MEMBER_AUTH_STYLE
  document.head.appendChild(el)
}

export function apply(ctx: Context) {
  ensureAuthStyle()
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/members', membersChrome).dispose)
  const slots = ctx.get('slots') as SlotsService
  slots.place('root-overlays', AuthGate, { key: 'member-auth', order: 0 })
  slots.place('root-overlays', AccountChip, { key: 'member-account', order: 5 })
  const snapshot = ctx.get('snapshot') as { onMessage?: (type: string, handler: (payload: unknown) => void) => () => void } | undefined
  ctx.effect(() => {
    if (!snapshot?.onMessage) return () => undefined
    return snapshot.onMessage('presence', (payload) => {
      window.dispatchEvent(new CustomEvent('biu:presence', { detail: payload }))
    })
  })
}
