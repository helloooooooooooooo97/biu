import { currentHttpCookie, httpRequest } from '@biu/type-http'
import { currentSessionId } from '@biu/host-sessions/scope'
import { cookieValue, readSession } from './session.ts'
import type { MembersStore } from './members-store.ts'
import type { SharesStore } from './shares-store.ts'

export type PageVisibility = {
  canSeePage: (pageId: string, ownerMemberId?: string) => Promise<boolean>
}

export type PageOwnership = {
  currentMemberId(): string
  resolveOwnerMemberId(): Promise<string>
}

type SessionPeek = {
  get?: (id: string) => Promise<{ config?: { ownerMemberId?: string; parentSessionId?: string } } | undefined>
  peek?: (id: string) => { config?: { ownerMemberId?: string; parentSessionId?: string } } | undefined
}

export function withUnrestrictedPageAccess<T>(fn: () => T): T {
  const prev = httpRequest.getStore() ?? {}
  return httpRequest.run({ ...prev, unrestricted: true }, fn)
}

export function createPageOwnership(members: MembersStore, secret: string, sessions: () => SessionPeek | undefined): PageOwnership {
  const currentMemberId = () => {
    const id = readSession(secret, cookieValue(currentHttpCookie()))
    return id && members.get(id) ? id : ''
  }

  const walkSessionOwner = async (sessionId: string) => {
    const api = sessions()
    let cur = sessionId.trim()
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const rec = api?.peek?.(cur) ?? (await api?.get?.(cur))
      const owner = String(rec?.config?.ownerMemberId ?? '').trim()
      if (owner && members.get(owner)) return owner
      cur = String(rec?.config?.parentSessionId ?? '').trim()
    }
    return ''
  }

  return {
    currentMemberId,
    async resolveOwnerMemberId() {
      const sid = currentSessionId()?.trim()
      if (sid) {
        const fromSession = await walkSessionOwner(sid)
        if (fromSession) return fromSession
      }
      return currentMemberId()
    },
  }
}

export function createPageVisibility(
  members: MembersStore,
  shares: SharesStore,
  ownership: PageOwnership,
): PageVisibility {
  return {
    async canSeePage(pageId: string, ownerMemberId?: string) {
      const store = httpRequest.getStore()
      const sid = currentSessionId()?.trim()
      if (store?.unrestricted) return true
      if (store == null && !sid) return true
      const actorId = (await ownership.resolveOwnerMemberId()) || ownership.currentMemberId()
      const actor = actorId ? members.get(actorId) : undefined
      if (!actor) return false
      if (actor.role === 'owner') return true
      if (shares.isShared(pageId)) return true
      return Boolean(ownerMemberId && ownerMemberId === actor.id)
    },
  }
}
