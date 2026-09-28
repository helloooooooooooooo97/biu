import { Service, type Context } from 'cordis'
import { dataPath, openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import type { RouteContext } from '@biu/type-http'
import { CollabError, CollabStore } from './store.ts'

export const name = 'account'
export const inject = ['http']

type AccountConfig = { sqlitePath?: string }

export class AccountService extends Service {
  store: CollabStore
  private db: { close(): void }

  constructor(ctx: Context, config: AccountConfig = {}) {
    super(ctx, 'account')
    const db = openAndMigrateBiu(config.sqlitePath ?? dataPath('biu.sqlite'))
    this.db = db
    this.store = new CollabStore(db)
    ctx.on('dispose', () => db.close())
  }
}

function bearer(route: RouteContext) {
  const header = String(route.req.headers.authorization ?? '')
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match?.[1] ?? ''
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
    return found
  }

  ctx.http.route('POST', '/api/account/register', async (route) => {
    try {
      const body = (await route.json()) as { name?: string }
      route.send(201, account.store.register(String(body.name ?? '')))
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

  ctx.http.route('POST', '/api/account/workspaces/:id/members', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { accountId?: string }
      const members = account.store.addMember(me.id, route.params.id!, String(body.accountId ?? ''))
      route.send(200, { members })
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
