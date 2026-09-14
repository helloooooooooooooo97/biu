import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Context } from 'cordis'
import { dataPath } from '@biu/host-plugin-loader/data-dir'
import { MembersStore } from './members-store.ts'
import { membersCollection } from './members-collection.ts'
import { cookieValue, isRole, readSession, setCookieHeader, signSession } from './session.ts'
import { createCollabServer, incomingToRequest } from './collab-server.ts'
import { YjsStore } from './yjs-store.ts'

export const name = 'core-collab'
export const inject = ['http', 'database']

export { MembersStore } from './members-store.ts'
export { YjsStore, pageDocName } from './yjs-store.ts'
export { canEdit, canInvite, signSession, readSession } from './session.ts'

function workspaceSecret(root: string) {
  const file = join(dataPath(root, 'collab'), 'secret')
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    mkdirSync(join(dataPath(root, 'collab')), { recursive: true })
    const secret = randomBytes(32).toString('hex')
    writeFileSync(file, secret)
    return secret
  }
}

export function apply(ctx: Context) {
  const root = process.cwd()
  const secret = workspaceSecret(root)
  const members = new MembersStore(join(dataPath(root, 'collab'), 'members.sqlite'))
  const yjs = new YjsStore(join(dataPath(root, 'collab'), 'yjs'))
  const sessionOf = (token: string) => readSession(secret, token)
  const collab = createCollabServer(members, yjs, sessionOf)
  const publicOrigin = (host?: string) => String(process.env.PUBLIC_ORIGIN ?? `http://${host ?? '127.0.0.1:5173'}`).replace(/\/$/, '')
  ctx.database.register(
    membersCollection(members, (role) => {
      const invite = members.createInvite(role)
      return { ...invite, url: `${publicOrigin()}/join?token=${encodeURIComponent(invite.token)}` }
    }),
  )

  const memberFromReq = (cookie?: string, token?: string) => {
    const id = readSession(secret, token) || readSession(secret, cookieValue(cookie))
    return id ? members.get(id) : undefined
  }

  ctx.http.route('GET', '/api/members/me', (route) => {
    const member = memberFromReq(route.req.headers.cookie)
    if (!member) {
      route.send(200, { member: null, empty: members.list().length === 0 })
      return
    }
    route.send(200, { member, token: signSession(secret, member.id) })
  })

  ctx.http.route('POST', '/api/members/bootstrap', async (route) => {
    const body = (await route.json<{ name?: string }>()) ?? {}
    try {
      const member = members.bootstrap(String(body.name ?? '用户'))
      const token = signSession(secret, member.id)
      route.res.setHeader('set-cookie', setCookieHeader(token))
      route.send(200, { member, token })
    } catch (error) {
      route.send(409, { error: String(error) })
    }
  })

  ctx.http.route('POST', '/api/members/invite', async (route) => {
    const actor = memberFromReq(route.req.headers.cookie)
    if (!actor || actor.role !== 'owner') {
      route.send(403, { error: 'owner required' })
      return
    }
    const body = (await route.json<{ role?: string }>()) ?? {}
    const role = isRole(body.role) ? body.role : 'editor'
    try {
      const invite = members.createInvite(role === 'owner' ? 'editor' : role)
      const origin = publicOrigin(String(route.req.headers.host ?? ''))
      route.send(200, { ...invite, url: `${origin}/join?token=${encodeURIComponent(invite.token)}` })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })

  ctx.http.route('POST', '/api/members/join', async (route) => {
    const body = (await route.json<{ token?: string; name?: string }>()) ?? {}
    try {
      const member = members.join(String(body.token ?? ''), String(body.name ?? '同事'))
      const token = signSession(secret, member.id)
      route.res.setHeader('set-cookie', setCookieHeader(token))
      route.send(200, { member, token })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })

  ctx.http.route('GET', '/api/members', (route) => {
    const actor = memberFromReq(route.req.headers.cookie)
    if (!actor) {
      route.send(401, { error: 'sign in' })
      return
    }
    route.send(200, { members: members.list() })
  })

  ctx.http.ws('/collaboration', (socket, req) => {
    const request = incomingToRequest(req)
    const connection = collab.handleConnection(socket as unknown as WebSocket, request)
    socket.on('message', (data) => {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data as Buffer)
      connection.handleMessage(bytes)
    })
    socket.on('close', (code, reason) => {
      connection.handleClose({ code, reason: reason.toString() })
    })
  })
}
