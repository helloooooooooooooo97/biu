import type { IncomingMessage } from 'node:http'
import { Hocuspocus } from '@hocuspocus/server'
import * as Y from 'yjs'
import { canEdit, type ShareAccess } from './session.ts'
import type { MembersStore } from './members-store.ts'
import type { SharesStore } from './shares-store.ts'
import { pageIdFromDoc, type YjsStore } from './yjs-store.ts'

export function createCollabServer(
  members: MembersStore,
  yjs: YjsStore,
  readSession: (token: string) => string,
  shares?: SharesStore,
  readShare?: (token: string) => ShareAccess | null,
  pageOwnedBy?: (memberId: string, pageId: string) => boolean,
) {
  return new Hocuspocus({
    debounce: 2000,
    async onAuthenticate({ token, documentName, connectionConfig }) {
      const pageId = pageIdFromDoc(documentName)
      if (!pageId) throw new Error('unknown document')
      const share = readShare?.(token)
      if (share) {
        const row = shares?.getByToken(share.token)
        if (!row || row.pageId !== pageId || share.pageId !== pageId) throw new Error('share mismatch')
        if (!canEdit(row.role) || !canEdit(share.role)) connectionConfig.readOnly = true
        return { user: { id: share.guestId, name: share.name, color: colorFor(share.guestId) } }
      }
      const member = members.get(readSession(token))
      if (!member) throw new Error('Authentication required')
      const owned = Boolean(pageOwnedBy?.(member.id, pageId))
      if (member.role !== 'owner' && !owned && shares && !shares.isShared(pageId)) throw new Error('page is not shared')
      if (!canEdit(member.role)) connectionConfig.readOnly = true
      return { user: { id: member.id, name: member.name, color: colorFor(member.id) } }
    },
    async onLoadDocument({ documentName, document }) {
      const pageId = pageIdFromDoc(documentName)
      if (pageId) yjs.applyTo(document as Y.Doc, pageId)
    },
    async onStoreDocument({ documentName, document }) {
      const pageId = pageIdFromDoc(documentName)
      if (!pageId) return
      yjs.save(pageId, yjs.encode(document as Y.Doc))
    },
  })
}

export function incomingToRequest(req: IncomingMessage) {
  const host = req.headers.host ?? '127.0.0.1'
  const url = `http://${host}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  return new Request(url, { method: req.method, headers })
}

function colorFor(id: string) {
  const colors = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777']
  let n = 0
  for (const ch of id) n = (n + ch.charCodeAt(0)) % colors.length
  return colors[n]
}
