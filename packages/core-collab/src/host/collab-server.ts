import type { IncomingMessage } from 'node:http'
import { Hocuspocus } from '@hocuspocus/server'
import * as Y from 'yjs'
import { canEdit } from './session.ts'
import type { MembersStore } from './members-store.ts'
import { pageIdFromDoc, type YjsStore } from './yjs-store.ts'

export function createCollabServer(members: MembersStore, yjs: YjsStore, readSession: (token: string) => string) {
  return new Hocuspocus({
    debounce: 2000,
    async onAuthenticate({ token, documentName, connectionConfig }) {
      const member = members.get(readSession(token))
      if (!member) throw new Error('Authentication required')
      const pageId = pageIdFromDoc(documentName)
      if (!pageId) throw new Error('unknown document')
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
