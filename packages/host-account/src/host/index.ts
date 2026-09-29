import { Service, type Context } from 'cordis'
import { biuSqlitePath, openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { readWorkspaceProfile } from '@biu/host-workspace'
import type { RouteContext } from '@biu/type-http'
import { CollabError, CollabStore } from './store.ts'
import type { AuthorizationService, ResourceRole } from './authorization.ts'
import { workspaceMembersCollection } from './workspace-members-collection.ts'

export type { Actor, Action, ResourceRef, ResourceRole, WorkspaceRole, Decision } from './authorization.ts'

export const name = 'account'
export const inject = ['http']

type AccountConfig = { sqlitePath?: string }

export class AccountService extends Service {
  store: CollabStore
  authorization: AuthorizationService
  private db: { close(): void }

  constructor(ctx: Context, config: AccountConfig = {}) {
    super(ctx, 'account')
    const db = openAndMigrateBiu(config.sqlitePath ?? biuSqlitePath())
    this.db = db
    this.store = new CollabStore(db)
    this.authorization = this.store.authorization
    ctx.inject(['database'], (inner) => inner.database.register(workspaceMembersCollection(this.store)))
    const profile = readWorkspaceProfile()
    this.store.bootstrapLocal({ accountName: profile.name || '我', workspaceName: '本机' })
    ctx.on('dispose', () => db.close())
  }
}

function bearer(route: RouteContext) {
  const header = String(route.req.headers.authorization ?? '')
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (match?.[1]) return match[1]
  const cookie = String(route.req.headers.cookie ?? '')
  const encoded = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('biu_account='))
  return encoded ? decodeURIComponent(encoded.slice('biu_account='.length)) : ''
}

function rememberLogin(route: RouteContext, token: string) {
  route.res.setHeader('set-cookie', `biu_account=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`)
}

function fail(route: RouteContext, error: unknown) {
  if (error instanceof CollabError) {
    route.send(error.status, { error: error.message })
    return
  }
  route.send(500, { error: String(error instanceof Error ? error.message : error) })
}

export function apply(ctx: Context, config: AccountConfig = {}) {
  const account = new AccountService(ctx, config)

  function actor(route: RouteContext) {
    const token = bearer(route)
    const found = token ? account.store.accountByToken(token) : null
    if (!found) throw new CollabError('需要登录', 401)
    rememberLogin(route, token)
    return found
  }

  ctx.http.route('POST', '/api/account/bootstrap', async (route) => {
    try {
      const profile = readWorkspaceProfile()
      route.send(200, account.store.bootstrapLocal({ accountName: profile.name || '我', workspaceName: '本机' }))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/active', async (route) => {
    try {
      actor(route)
      route.send(200, { workspaceId: account.store.activeWorkspaceId() })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/active', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string }
      const workspaceId = account.store.setActive(me.id, String(body.workspaceId ?? ''))
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, { workspaceId })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/register', async (route) => {
    try {
      const body = (await route.json()) as { email?: string; password?: string }
      const password = String(body.password ?? '')
      const email = String(body.email ?? '')
      if (!password.trim()) throw new CollabError('密码不能为空', 400)
      if (!email.trim()) throw new CollabError('邮箱不能为空', 400)
      const created = account.store.register('', Date.now(), password, email)
      const workspaceId = account.store.enter(created.id)
      rememberLogin(route, created.token)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(201, { id: created.id, name: created.name, createdAt: created.createdAt, token: created.token, workspaceId })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/login', async (route) => {
    try {
      const body = (await route.json()) as { email?: string; password?: string }
      const found = account.store.login(String(body.email ?? ''), String(body.password ?? ''))
      const workspaceId = account.store.enter(found.id)
      rememberLogin(route, found.token)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, { id: found.id, name: found.name, createdAt: found.createdAt, token: found.token, workspaceId })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/logout', async (route) => {
    route.res.setHeader('set-cookie', [
      'biu_account=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      'biu_legacy_account=; Path=/; SameSite=Strict; Max-Age=0',
    ])
    route.send(200, { ok: true })
  })

  ctx.http.route('GET', '/api/account/me', async (route) => {
    try {
      route.send(200, actor(route))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/workspace-profile', async (route) => {
    try {
      route.send(200, account.store.workspaceProfile(actor(route).id))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspace-profile', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { name?: unknown; avatar?: unknown }
      route.send(
        200,
        account.store.saveWorkspaceProfile(me.id, {
          ...(typeof body.name === 'string' ? { name: body.name } : {}),
          ...(typeof body.avatar === 'string' ? { avatar: body.avatar } : {}),
        }),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/workspaces', async (route) => {
    try {
      const me = actor(route)
      route.send(200, { workspaces: account.store.listWorkspaces(me.id) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { name?: string }
      route.send(201, account.store.createWorkspace(me.id, String(body.name ?? '')))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/workspaces/:id/members', async (route) => {
    try {
      const me = actor(route)
      route.send(200, { members: account.store.members(me.id, route.params.id!) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces/:id/members', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { accountId?: string; email?: string }
      const email = String(body.email ?? '').trim()
      const members = email
        ? account.store.addMemberByEmail(me.id, route.params.id!, email)
        : account.store.addMember(me.id, route.params.id!, String(body.accountId ?? ''))
      route.send(200, { members })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces/:id/invites', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { role?: string; expiresInHours?: number }
      const role = body.role === 'member' ? 'member' : 'viewer'
      const invite = account.store.createWorkspaceInvite(
        me.id,
        route.params.id!,
        role,
        Number(body.expiresInHours ?? 168),
      )
      route.send(201, {
        ...invite,
        path: `/?workspaceInvite=${encodeURIComponent(invite.token)}`,
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/invites/:token/accept', async (route) => {
    try {
      const me = actor(route)
      const result = account.store.acceptWorkspaceInvite(me.id, route.params.token!)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, result)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/guest-invites/:token/accept', async (route) => {
    try {
      const body = (await route.json()) as { name?: string }
      const result = account.store.acceptGuestInvite(route.params.token!, String(body.name ?? ''))
      rememberLogin(route, result.token)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, result)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/workspaces/:id/members/:accountId', async (route) => {
    try {
      const me = actor(route)
      account.store.removeMember(me.id, route.params.id!, route.params.accountId!)
      route.send(200, { members: account.store.members(me.id, route.params.id!) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('PATCH', '/api/account/workspaces/:id/members/:accountId', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { role?: string }
      const role = String(body.role ?? '')
      if (role !== 'owner' && role !== 'admin' && role !== 'member' && role !== 'viewer') {
        throw new CollabError('角色只能是 owner、admin、member 或 viewer', 400)
      }
      account.store.updateMemberRole(me.id, route.params.id!, route.params.accountId!, role)
      route.send(200, { members: account.store.members(me.id, route.params.id!) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/workspaces/:id/groups', async (route) => {
    try {
      const me = actor(route)
      route.send(200, { groups: account.store.groups(me.id, route.params.id!) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces/:id/groups', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { name?: string }
      route.send(201, account.store.createGroup(me.id, route.params.id!, String(body.name ?? '')))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces/:id/groups/:groupId/members', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { email?: string }
      route.send(
        200,
        {
          members: account.store.addGroupMemberByEmail(
            me.id,
            route.params.id!,
            route.params.groupId!,
            String(body.email ?? ''),
          ),
        },
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/access', async (route) => {
    try {
      const me = actor(route)
      route.send(
        200,
        account.store.recordAccess(me.id, String(route.query.get('collection') ?? ''), String(route.query.get('recordId') ?? '')),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/access', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as {
        collection?: string
        recordId?: string
        email?: string
        groupId?: string
        memberViewId?: string
        role?: ResourceRole
      }
      const collection = String(body.collection ?? '')
      const recordId = String(body.recordId ?? '')
      const role: ResourceRole =
        body.role === 'viewer' || body.role === 'manager' || body.role === 'owner' ? body.role : 'editor'
      route.send(
        200,
        body.memberViewId
          ? account.store.grantMemberView(me.id, collection, recordId, String(body.memberViewId), role)
          : body.groupId
          ? account.store.grantGroup(me.id, collection, recordId, String(body.groupId), role)
          : account.store.shareWithEmail(me.id, collection, recordId, String(body.email ?? ''), role),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/access/guest-invite', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as {
        collection?: string
        recordId?: string
        role?: string
        expiresInHours?: number
      }
      const invite = account.store.createGuestInvite(
        me.id,
        String(body.collection ?? ''),
        String(body.recordId ?? ''),
        body.role === 'editor' ? 'editor' : 'viewer',
        Number(body.expiresInHours ?? 24),
      )
      route.send(201, {
        ...invite,
        path: `/?guestInvite=${encodeURIComponent(invite.token)}`,
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/records/claim', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string; collection?: string; recordId?: string }
      route.send(
        200,
        account.store.claim(me.id, String(body.workspaceId ?? ''), String(body.collection ?? ''), String(body.recordId ?? '')),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/sync', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as {
        workspaceId?: string
        collection?: string
        recordId?: string
        field?: string
        value?: unknown
        expectedVersion?: number
      }
      const op = account.store.sync({
        actorId: me.id,
        workspaceId: String(body.workspaceId ?? ''),
        collection: String(body.collection ?? ''),
        recordId: String(body.recordId ?? ''),
        field: String(body.field ?? ''),
        value: body.value,
        expectedVersion: Number(body.expectedVersion ?? 0),
      })
      route.send(200, op)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/sync', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = String(route.query.get('workspaceId') ?? '')
      const after = Number(route.query.get('after') ?? 0)
      route.send(200, { ops: account.store.opsSince(me.id, workspaceId, after) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/locks', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as {
        workspaceId?: string
        collection?: string
        recordId?: string
        ttlMs?: number
      }
      route.send(
        200,
        account.store.acquireLock(
          me.id,
          String(body.workspaceId ?? ''),
          String(body.collection ?? ''),
          String(body.recordId ?? ''),
          body.ttlMs,
        ),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/locks', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string; collection?: string; recordId?: string }
      account.store.releaseLock(
        me.id,
        String(body.workspaceId ?? ''),
        String(body.collection ?? ''),
        String(body.recordId ?? ''),
      )
      route.send(200, { ok: true })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/presence', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string; collection?: string; recordId?: string }
      account.store.pulse(
        me.id,
        String(body.workspaceId ?? ''),
        String(body.collection ?? ''),
        String(body.recordId ?? ''),
      )
      route.send(200, { presence: account.store.presence(me.id, String(body.workspaceId ?? '')) })
    } catch (error) {
      fail(route, error)
    }
  })
}
