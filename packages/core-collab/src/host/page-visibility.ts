import { currentHttpCookie, httpRequest } from '@biu/type-http'
import { currentSessionId } from '@biu/host-sessions/scope'
import { cookieValue, readSession } from './session.ts'
import type { MembersStore } from './members-store.ts'
import type { SharesStore } from './shares-store.ts'

/** 工作区公共表：登录即可看。其它表按归属 / 分享过滤。 */
const WORKSPACE_TABLES = new Set(['/members', '/plugins', '/facets', '/views', '/notices'])

export type RecordAccessInput = {
  collection: string
  recordId: string
  ownerMemberId?: string
  pageId?: string
}

export type PageVisibility = {
  canSeePage: (pageId: string, ownerMemberId?: string) => Promise<boolean>
  canSeeRecord: (input: RecordAccessInput) => Promise<boolean>
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
  const actorOf = async () => {
    const actorId = (await ownership.resolveOwnerMemberId()) || ownership.currentMemberId()
    return actorId ? members.get(actorId) : undefined
  }

  return {
    async canSeeRecord(input) {
      const store = httpRequest.getStore()
      if (store?.unrestricted) return true
      const actor = await actorOf()
      if (!actor) return false
      if (actor.role === 'owner') return true
      if (WORKSPACE_TABLES.has(input.collection)) return true
      const pageId = input.pageId || (input.collection === '/pages' ? input.recordId : '')
      if (pageId && shares.isShared(pageId)) return true
      return Boolean(input.ownerMemberId && ownerMemberIdMatches(input.ownerMemberId, actor.id))
    },
    canSeePage(pageId, ownerMemberId) {
      return this.canSeeRecord({ collection: '/pages', recordId: pageId, pageId, ownerMemberId })
    },
  }
}

function ownerMemberIdMatches(ownerMemberId: string, actorId: string) {
  return ownerMemberId === actorId
}
