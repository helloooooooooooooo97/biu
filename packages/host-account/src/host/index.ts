import { Service, type Context } from 'cordis'
import { biuSqlitePath, openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { readWorkspaceProfile } from '@biu/host-workspace'
import type { RouteContext } from '@biu/type-http'
import { CollabError, CollabStore } from './store.ts'
import { httpRemote, RecordReplica } from './replica.ts'
import { applySnapshot, exchangeSnapshot, takeSnapshot, type MirrorSnapshot } from './mirror.ts'
import type { AuthorizationService, ResourceRole } from './authorization.ts'
import { workspaceMembersCollection } from './workspace-members-collection.ts'

export type { Actor, Action, ResourceRef, ResourceRole, WorkspaceRole, Decision } from './authorization.ts'

export const name = 'account'
export const inject = ['http']

type AccountConfig = { sqlitePath?: string }

export class AccountService extends Service {
  store: CollabStore
  authorization: AuthorizationService
  replica: RecordReplica | null = null
  private db: {
    close(): void
    exec(sql: string): void
    prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[]; run(...args: unknown[]): unknown }
  }

  constructor(ctx: Context, config: AccountConfig = {}) {
    super(ctx, 'account')
    const db = openAndMigrateBiu(config.sqlitePath ?? biuSqlitePath())
    this.db = db
    this.store = new CollabStore(db)
    this.authorization = this.store.authorization
    db.exec(`CREATE TABLE IF NOT EXISTS record_place (
      collection TEXT NOT NULL,
      record_id TEXT NOT NULL,
      place TEXT NOT NULL,
      PRIMARY KEY (collection, record_id)
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS record_cloud_copy (
      collection TEXT NOT NULL,
      local_id TEXT NOT NULL,
      cloud_id TEXT NOT NULL,
      PRIMARY KEY (collection, local_id)
    )`)
    const origin = process.env.BIU_REMOTE_ORIGIN
    if (process.env.BIU_ONLINE !== '1' && origin) {
      this.replica = new RecordReplica(db, httpRemote(origin))
      const timer = setInterval(() => {
        const device = this.replica?.active()
        if (!device?.token) return
        void exchangeSnapshot(ctx, origin, device.token, device.accountId).catch((error) => {
          console.warn('[replica] sync failed', error)
        })
      }, 3000)
      ctx.on('dispose', () => clearInterval(timer))
      ctx.on('account/request', (event) => {
        const payload = event as { accountId?: string; token?: string }
        if (!payload.accountId || !payload.token || !this.replica) return
        this.replica.remember({ accountId: payload.accountId, workspaceId: '', token: payload.token })
      })
    }
    ctx.inject(['database'], (inner) => inner.database.register(workspaceMembersCollection(this.store)))
    if (process.env.BIU_ONLINE !== '1') {
      const profile = readWorkspaceProfile()
      this.store.bootstrapLocal({ accountName: profile.name || '我', workspaceName: '本机' })
    }
    ctx.on('dispose', () => db.close())
  }

  isRemote(collection: string, id: string) {
    const row = this.db.prepare('SELECT place FROM record_place WHERE collection = ? AND record_id = ?').get(collection, id) as
      | { place?: string }
      | undefined
    return row?.place === 'remote'
  }

  markRemote(collection: string, id: string) {
    this.db
      .prepare(
        `INSERT INTO record_place (collection, record_id, place) VALUES (?, ?, 'remote')
         ON CONFLICT(collection, record_id) DO UPDATE SET place = 'remote'`,
      )
      .run(collection, id)
  }

  clearPlace(collection: string, id: string) {
    this.db.prepare('DELETE FROM record_place WHERE collection = ? AND record_id = ?').run(collection, id)
  }

  remoteIds(collection: string) {
    const rows = this.db.prepare(`SELECT record_id FROM record_place WHERE collection = ? AND place = 'remote'`).all(collection) as Array<{
      record_id: string
    }>
    return rows.map((row) => row.record_id)
  }

  copiedCloud(collection: string, id: string) {
    const row = this.db.prepare('SELECT cloud_id FROM record_cloud_copy WHERE collection = ? AND local_id = ?').get(collection, id) as
      | { cloud_id?: string }
      | undefined
    return row?.cloud_id || ''
  }

  rememberCopy(collection: string, localId: string, cloudId: string) {
    this.db
      .prepare(
        `INSERT INTO record_cloud_copy (collection, local_id, cloud_id) VALUES (?, ?, ?)
         ON CONFLICT(collection, local_id) DO UPDATE SET cloud_id = excluded.cloud_id`,
      )
      .run(collection, localId, cloudId)
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
      const origin = process.env.BIU_REMOTE_ORIGIN
      if (process.env.BIU_ONLINE !== '1' && origin) {
        try {
          const remote = await fetch(`${origin.replace(/\/$/, '')}/api/account/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          const payload = (await remote.json().catch(() => ({}))) as {
            id?: string
            name?: string
            token?: string
            workspaceId?: string
            error?: string
          }
          if (!remote.ok || !payload.token || !payload.id) {
            route.send(remote.status, payload.error ? payload : { error: '注册失败' })
            return
          }
          const adopted = account.store.ensureRemoteAccount({
            id: payload.id,
            name: payload.name || email,
            email,
            token: payload.token,
            workspaceId: String(payload.workspaceId ?? ''),
          })
          account.replica?.remember({
            accountId: adopted.id,
            workspaceId: adopted.workspaceId,
            token: adopted.token,
          })
          rememberLogin(route, adopted.token)
          route.send(201, { id: adopted.id, name: payload.name, token: adopted.token, workspaceId: adopted.workspaceId })
          return
        } catch {
          /* 集中部署不在时仍在本机注册 */
        }
      }
      const created = account.store.register('', Date.now(), password, email)
      const workspaceId = account.store.enter(created.id)
      const session = account.store.openSession(created.id, String(route.req.headers['user-agent'] ?? '浏览器').slice(0, 120))
      rememberLogin(route, session.token)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(201, { id: created.id, name: created.name, createdAt: created.createdAt, token: session.token, workspaceId })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/login', async (route) => {
    try {
      const body = (await route.json()) as { email?: string; password?: string }
      const origin = process.env.BIU_REMOTE_ORIGIN
      if (process.env.BIU_ONLINE !== '1' && origin) {
        try {
          const remote = await fetch(`${origin.replace(/\/$/, '')}/api/account/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: body.email ?? '', password: body.password ?? '' }),
          })
          const payload = (await remote.json().catch(() => ({}))) as {
            id?: string
            name?: string
            token?: string
            workspaceId?: string
            error?: string
          }
          if (!remote.ok || !payload.token || !payload.id) {
            route.send(remote.status, payload.error ? payload : { error: '登录失败' })
            return
          }
          const adopted = account.store.ensureRemoteAccount({
            id: payload.id,
            name: payload.name || String(body.email ?? ''),
            email: String(body.email ?? ''),
            token: payload.token,
            workspaceId: String(payload.workspaceId ?? ''),
          })
          account.replica?.remember({
            accountId: adopted.id,
            workspaceId: adopted.workspaceId,
            token: adopted.token,
          })
          rememberLogin(route, adopted.token)
          route.send(200, { id: adopted.id, name: payload.name, token: adopted.token, workspaceId: adopted.workspaceId })
          return
        } catch {
          /* 集中部署不在时仍用本机账号 */
        }
      }
      const found = account.store.login(
        String(body.email ?? ''),
        String(body.password ?? ''),
        String(route.req.headers['user-agent'] ?? '浏览器'),
      )
      const workspaceId = account.store.enter(found.id)
      rememberLogin(route, found.token)
      account.replica?.remember({
        accountId: found.id,
        workspaceId: String(workspaceId),
        token: found.token,
      })
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, {
        id: found.id,
        name: found.name,
        createdAt: found.createdAt,
        token: found.token,
        workspaceId,
        mustChangePassword: found.mustChangePassword === true,
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/logout', async (route) => {
    const token = bearer(route)
    const found = token ? account.store.accountByToken(token) : null
    account.store.revokeSession(token)
    if (found) ctx.http.disconnectRevokedSessions(found.id)
    route.res.setHeader('set-cookie', [
      'biu_account=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      'biu_legacy_account=; Path=/; SameSite=Strict; Max-Age=0',
    ])
    route.send(200, { ok: true })
  })

  ctx.http.route('POST', '/api/account/password', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { currentPassword?: string; nextPassword?: string }
      const changed = account.store.changePassword(me.id, String(body.currentPassword ?? ''), String(body.nextPassword ?? ''), bearer(route))
      ctx.http.disconnectRevokedSessions(me.id)
      route.send(200, changed)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/sessions', async (route) => {
    try {
      const me = actor(route)
      route.send(200, { sessions: account.store.listSessions(me.id) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/sessions/:id', async (route) => {
    try {
      const me = actor(route)
      const revoked = account.store.revokeSessionById(me.id, String(route.params.id ?? ''))
      ctx.http.disconnectRevokedSessions(me.id)
      route.send(200, revoked)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/mcp/credentials', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string; allowedTools?: unknown; expiresInHours?: unknown }
      const workspaceId = String(body.workspaceId ?? '').trim()
      if (!workspaceId) throw new CollabError('需要空间', 400)
      const hours = Math.min(24 * 365, Math.max(1, Number(body.expiresInHours ?? 24 * 90)))
      const allowedTools = Array.isArray(body.allowedTools) ? body.allowedTools.map(String) : []
      route.send(
        201,
        account.store.issueMcpCredential(me.id, workspaceId, {
          allowedTools,
          expiresAt: Date.now() + hours * 60 * 60 * 1000,
        }),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/mcp/credentials', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = String(route.query.get('workspaceId') ?? '').trim()
      if (!workspaceId) throw new CollabError('需要空间', 400)
      route.send(200, { credentials: account.store.listMcpCredentials(me.id, workspaceId) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/mcp/credentials/:id', async (route) => {
    try {
      route.send(200, account.store.revokeMcpCredential(actor(route).id, String(route.params.id ?? '')))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/mcp/audit', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = String(route.query.get('workspaceId') ?? '').trim()
      if (!workspaceId) throw new CollabError('需要空间', 400)
      route.send(200, {
        events: account.store.listMcpAudit(me.id, workspaceId, Number(route.query.get('limit') ?? 100)),
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/me', async (route) => {
    try {
      const me = actor(route)
      route.send(200, me)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/plugins/audit', async (route) => {
    try {
      const me = actor(route)
      route.send(200, {
        events: account.store.listPluginAudit(
          me.id,
          String(route.query.get('workspaceId') ?? ''),
          Number(route.query.get('limit') ?? 100),
        ),
      })
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

  ctx.http.route('PATCH', '/api/account/workspaces/:id', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { name?: string }
      route.send(200, account.store.renameWorkspace(me.id, route.params.id!, String(body.name ?? '')))
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
      ctx.http.disconnectTenant(route.params.accountId!, route.params.id!)
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
      const collection = String(route.query.get('collection') ?? '')
      const viewId = String(route.query.get('viewId') ?? '')
      route.send(
        200,
        viewId
          ? account.store.viewAccess(me.id, collection, viewId)
          : account.store.recordAccess(me.id, collection, String(route.query.get('recordId') ?? '')),
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
        viewId?: string
        email?: string
        groupId?: string
        memberViewId?: string
        role?: ResourceRole
        collaboratorKind?: 'internal' | 'external'
      }
      const collection = String(body.collection ?? '')
      const recordId = String(body.recordId ?? '')
      const viewId = String(body.viewId ?? '')
      const role: ResourceRole =
        body.role === 'viewer' || body.role === 'manager' || body.role === 'owner' ? body.role : 'editor'
      const kind = body.collaboratorKind === 'internal' ? 'internal' : 'external'
      route.send(
        200,
        viewId
          ? body.memberViewId
            ? account.store.grantViewMemberView(me.id, collection, viewId, String(body.memberViewId), role)
            : account.store.shareViewWithEmail(me.id, collection, viewId, String(body.email ?? ''), role, kind)
          : body.memberViewId
          ? account.store.grantMemberView(me.id, collection, recordId, String(body.memberViewId), role)
          : body.groupId
          ? account.store.grantGroup(me.id, collection, recordId, String(body.groupId), role)
          : account.store.shareWithEmail(me.id, collection, recordId, String(body.email ?? ''), role, kind),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/access', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as {
        collection?: string
        recordId?: string
        viewId?: string
        subjectType?: 'account' | 'group' | 'member_view'
        subjectId?: string
      }
      const viewId = String(body.viewId ?? '')
      const subjectType =
        body.subjectType === 'group' || body.subjectType === 'member_view' ? body.subjectType : 'account'
      route.send(
        200,
        viewId
          ? account.store.revokeViewGrant(
              me.id,
              String(body.collection ?? ''),
              viewId,
              subjectType === 'member_view' ? 'member_view' : 'account',
              String(body.subjectId ?? ''),
            )
          : account.store.revokeRecordGrant(
              me.id,
              String(body.collection ?? ''),
              String(body.recordId ?? ''),
              subjectType,
              String(body.subjectId ?? ''),
            ),
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
        viewId?: string
        role?: string
        expiresInHours?: number
      }
      const invite = account.store.createGuestInvite(
        me.id,
        String(body.collection ?? ''),
        String(body.recordId ?? ''),
        body.role === 'editor' ? 'editor' : 'viewer',
        Number(body.expiresInHours ?? 24),
        Date.now(),
        String(body.viewId ?? ''),
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

  ctx.http.route('GET', '/api/replica/snapshot', async (route) => {
    try {
      actor(route)
      route.send(200, await takeSnapshot(ctx))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/replica/snapshot', async (route) => {
    try {
      actor(route)
      const body = (await route.json()) as MirrorSnapshot
      await applySnapshot(ctx, body, 'adopt')
      route.send(200, { ok: true })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/sync', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = String(route.query.get('workspaceId') ?? '')
      const after = Number(route.query.get('after') ?? 0)
      const ops =
        route.query.get('visible') === '1'
          ? account.store.visibleOpsSince(me.id, workspaceId, after)
          : account.store.opsSince(me.id, workspaceId, after)
      route.send(200, { ops })
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
