import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Service, type Context } from 'cordis'
import { dataPath } from '@biu/host-plugin-loader/data-dir'
import { MembersStore, DEFAULT_ADMIN_NAME, DEFAULT_ADMIN_PASSWORD } from './members-store.ts'
import { membersCollection } from './members-collection.ts'
import { cookieValue, isRole, newId, readSession, readShareAccess, setCookieHeader, clearCookieHeader, signSession, signShareAccess } from './session.ts'
import { createCollabServer, incomingToRequest } from './collab-server.ts'
import { YjsStore } from './yjs-store.ts'
import { isShareRole, SharesStore } from './shares-store.ts'
import { PRESENCE_CHANNEL, PresenceStore } from './presence.ts'
import { createPageVisibility, createPageOwnership, withUnrestrictedPageAccess } from './page-visibility.ts'

export const name = 'core-collab'
export const inject = ['http', 'database']

export { MembersStore, DEFAULT_ADMIN_NAME, DEFAULT_ADMIN_PASSWORD } from './members-store.ts'
export { SharesStore } from './shares-store.ts'
export { YjsStore, pageDocName } from './yjs-store.ts'
export { canEdit, canInvite, signSession, readSession, signShareAccess, readShareAccess, shareTokenFromPath } from './session.ts'

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
  members.ensureDefaultAdmin()
  const shares = new SharesStore(join(dataPath(root, 'collab'), 'shares.sqlite'))
  const yjs = new YjsStore(join(dataPath(root, 'collab'), 'yjs'))
  const presence = new PresenceStore()
  const sessionOf = (token: string) => readSession(secret, token)
  const collab = createCollabServer(members, yjs, sessionOf, shares, (token) => readShareAccess(secret, token))
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
  const sessionsOf = () => {
    try {
      return ctx.get('sessions') as {
        get?: (id: string) => Promise<{ config?: { ownerMemberId?: string; parentSessionId?: string } } | undefined>
        peek?: (id: string) => { config?: { ownerMemberId?: string; parentSessionId?: string } } | undefined
      }
    } catch {
      return undefined
    }
  }
  const pageOwnership = createPageOwnership(members, secret, sessionsOf)
  const pageVisibility = createPageVisibility(members, shares, pageOwnership)
  ctx.database.setPageAccess?.({
    canSeePage: (pageId, ownerMemberId) => pageVisibility.canSeePage(pageId, ownerMemberId),
    resolveOwnerMemberId: () => pageOwnership.resolveOwnerMemberId(),
  })
  new (class WorkspaceIdentity extends Service {
    constructor() {
      super(ctx, 'identity')
    }
    currentMemberId() {
      return pageOwnership.currentMemberId()
    }
  })()

  ctx.http.route('GET', '/api/members/me', (route) => {
    const member = memberFromReq(route.req.headers.cookie)
    if (!member) {
      route.send(200, { member: null, empty: members.list().length === 0 })
      return
    }
    route.send(200, { member, token: signSession(secret, member.id) })
  })

  ctx.http.route('POST', '/api/members/bootstrap', async (route) => {
    const body = (await route.json<{ name?: string; password?: string }>()) ?? {}
    try {
      const member = members.bootstrap(String(body.name ?? '用户'), String(body.password ?? ''))
      const token = signSession(secret, member.id)
      route.res.setHeader('set-cookie', setCookieHeader(token))
      route.send(200, { member, token })
    } catch (error) {
      route.send(409, { error: String(error) })
    }
  })

  ctx.http.route('POST', '/api/members/register', async (route) => {
    const body = (await route.json<{ name?: string; password?: string }>()) ?? {}
    try {
      const member = members.register(String(body.name ?? ''), String(body.password ?? ''))
      const token = signSession(secret, member.id)
      route.res.setHeader('set-cookie', setCookieHeader(token))
      route.send(200, { member, token })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })

  ctx.http.route('POST', '/api/members/login', async (route) => {
    const body = (await route.json<{ name?: string; password?: string }>()) ?? {}
    try {
      const member = members.login(String(body.name ?? ''), String(body.password ?? ''))
      const token = signSession(secret, member.id)
      route.res.setHeader('set-cookie', setCookieHeader(token))
      route.send(200, { member, token })
    } catch (error) {
      route.send(401, { error: String(error) })
    }
  })

  ctx.http.route('POST', '/api/members/logout', (route) => {
    route.res.setHeader('set-cookie', clearCookieHeader())
    route.send(200, { ok: true })
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
    const body = (await route.json<{ token?: string; name?: string; password?: string }>()) ?? {}
    try {
      const member = members.join(String(body.token ?? ''), String(body.name ?? '同事'), String(body.password ?? ''))
      const token = signSession(secret, member.id)
      route.res.setHeader('set-cookie', setCookieHeader(token))
      route.send(200, { member, token })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })

  ctx.http.route('POST', '/api/members/guest', async (route) => {
    const body = (await route.json<{ guestId?: string }>()) ?? {}
    try {
      const member = members.ensureGuest(String(body.guestId ?? ''))
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

  const pageMeta = async (pageId: string) => {
    const database = ctx.get('database') as {
      read: (path: string) => Promise<{ value?: { title?: unknown; name?: unknown } }>
      content: (path: string) => Promise<{ value?: unknown }>
    }
    const path = `/pages/${pageId}`
    let title = pageId
    let content: unknown = ''
    try {
      const read = await withUnrestrictedPageAccess(() => database.read(path))
      title = String(read?.value?.title ?? read?.value?.name ?? '').trim() || pageId
    } catch {
      /* page may not exist yet */
    }
    try {
      content = (await withUnrestrictedPageAccess(() => database.content(path))).value ?? ''
    } catch {
      content = ''
    }
    return { title, content }
  }

  ctx.http.route('POST', '/api/shares', async (route) => {
    const actor = memberFromReq(route.req.headers.cookie)
    if (!actor || actor.role !== 'owner') {
      route.send(403, { error: 'owner required' })
      return
    }
    const body = (await route.json<{ pageId?: string; role?: string }>()) ?? {}
    const role = isShareRole(body.role) ? body.role : 'editor'
    try {
      const share = shares.create(String(body.pageId ?? ''), role, actor.id)
      const origin = publicOrigin(String(route.req.headers.host ?? ''))
      route.send(200, { ...share, url: `${origin}/share/${encodeURIComponent(share.token)}` })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })

  ctx.http.route('GET', '/api/shares', (route) => {
    const actor = memberFromReq(route.req.headers.cookie)
    if (!actor || actor.role !== 'owner') {
      route.send(403, { error: 'owner required' })
      return
    }
    const pageId = String(route.query.get('pageId') ?? '')
    const origin = publicOrigin(String(route.req.headers.host ?? ''))
    route.send(200, {
      shares: shares.list(pageId).map((item) => ({
        pageId: item.pageId,
        role: item.role,
        createdAt: item.createdAt,
        locked: item.role === 'viewer',
        url: `${origin}/share/${encodeURIComponent(item.token)}`,
      })),
    })
  })

  ctx.http.route('DELETE', '/api/shares', (route) => {
    const actor = memberFromReq(route.req.headers.cookie)
    if (!actor || actor.role !== 'owner') {
      route.send(403, { error: 'owner required' })
      return
    }
    const pageId = String(route.query.get('pageId') ?? '')
    route.send(200, { ok: shares.revokePage(pageId) })
  })

  ctx.http.route('GET', '/api/shares/:token', async (route) => {
    const token = String(route.params.token ?? '')
    const share = shares.getByToken(token)
    if (!share) {
      route.send(404, { error: 'unknown share' })
      return
    }
    const meta = await pageMeta(share.pageId)
    route.send(200, { pageId: share.pageId, role: share.role, locked: share.role === 'viewer', title: meta.title })
  })

  ctx.http.route('POST', '/api/shares/:token/enter', async (route) => {
    const token = String(route.params.token ?? '')
    const share = shares.getByToken(token)
    if (!share) {
      route.send(404, { error: 'unknown share' })
      return
    }
    const body = (await route.json<{ name?: string }>()) ?? {}
    const name = String(body.name ?? '').trim()
    if (!name) {
      route.send(400, { error: 'name required' })
      return
    }
    const guestId = newId('g')
    const access = signShareAccess(secret, {
      token,
      pageId: share.pageId,
      role: share.role,
      guestId,
      name,
    })
    const meta = await pageMeta(share.pageId)
    route.send(200, {
      token: access,
      pageId: share.pageId,
      role: share.role,
      locked: share.role === 'viewer',
      title: meta.title,
      content: meta.content,
      guest: { id: guestId, name },
    })
  })

  const bumpPresence = (pageId: string) => {
    const viewers = presence.list(pageId)
    ctx.http.broadcast(PRESENCE_CHANNEL, { pageId, viewers })
    return viewers
  }

  ctx.http.route('GET', '/api/collab/presence', (route) => {
    const pageId = String(route.query.get('pageId') ?? '')
    route.send(200, { viewers: presence.list(pageId) })
  })

  ctx.http.route('POST', '/api/collab/presence', async (route) => {
    const body = (await route.json<{ pageId?: string; guestId?: string; color?: string; from?: number; name?: string }>()) ?? {}
    const actor = memberFromReq(route.req.headers.cookie)
    const pageId = String(body.pageId ?? '')
    const guestId = actor?.id || String(body.guestId ?? '')
    const from = Number.isFinite(Number(body.from)) ? Number(body.from) : undefined
    const viewers = presence.touch(pageId, guestId, body.color, from, actor?.name || body.name)
    bumpPresence(pageId)
    route.send(200, { viewers })
  })

  ctx.http.ws('/collaboration', (socket, req) => {
    const request = incomingToRequest(req)
    const connection = collab.handleConnection(socket as unknown as WebSocket, request)
    socket.on('message', (data) => {
      const bytes =
        data instanceof Uint8Array
          ? data
          : Array.isArray(data)
            ? new Uint8Array(Buffer.concat(data as Buffer[]))
            : new Uint8Array(data as ArrayBuffer)
      connection.handleMessage(bytes)
    })
    socket.on('close', (code, reason) => {
      connection.handleClose({ code, reason: reason.toString() })
    })
  })
}
