import type { Context } from 'cordis'
import { runWithAccount } from '@biu/host-plugin-loader/data-dir'
import type { SessionRecord } from '@biu/type-session'

export type MirrorSnapshot = {
  sessions: Array<SessionRecord & { updatedAt?: number }>
  collections: Array<{ path: string; records: Array<Record<string, unknown> & { id: string; updatedAt?: number }> }>
}

type SessionStoreLike = {
  listSummaries: () => Promise<Array<{ id: string; updatedAt?: number }>>
  load: (id: string) => Promise<SessionRecord | null | undefined>
  save: (record: SessionRecord & { updatedAt?: number }) => Promise<void>
}

type DatabaseLike = {
  syncedRecords: () => Promise<MirrorSnapshot['collections']>
  applySynced: (path: string, records: MirrorSnapshot['collections'][number]['records']) => Promise<void>
}

function sessionsOf(ctx: Context) {
  try {
    return ctx.get('sessionStore') as SessionStoreLike | undefined
  } catch {
    return undefined
  }
}

function databaseOf(ctx: Context) {
  try {
    return ctx.get('database') as DatabaseLike | undefined
  } catch {
    return undefined
  }
}

function sessionVisible(ctx: Context, id: string, record?: { id?: unknown }) {
  try {
    const sessions = ctx.get('sessions') as { inWorkspace?: (id: string, record?: { id?: unknown }) => boolean } | undefined
    if (typeof sessions?.inWorkspace === 'function') return sessions.inWorkspace(id, record)
  } catch {
    /* 没有会话服务时按存储里的全部导出，测试走这条 */
  }
  return true
}

function claim(ctx: Context, collection: string, id: string) {
  try {
    const account = ctx.get('account') as
      | { store?: { activeWorkspaceId(): string | null; attach(workspaceId: string, collection: string, recordId: string): void } }
      | undefined
    const workspaceId = account?.store?.activeWorkspaceId()
    if (!workspaceId || !account?.store) return
    account.store.attach(workspaceId, collection, id)
  } catch {
    /* 已经挂在别的空间，或这台机器还没有空间 */
  }
}

export async function takeSnapshot(ctx: Context): Promise<MirrorSnapshot> {
  const sessions: MirrorSnapshot['sessions'] = []
  const store = sessionsOf(ctx)
  if (store) {
    for (const item of await store.listSummaries()) {
      if (!sessionVisible(ctx, item.id, item)) continue
      const full = await store.load(item.id)
      if (!full) continue
      sessions.push({ ...full, updatedAt: Number(item.updatedAt) || 0 })
    }
  }
  const collections = (await databaseOf(ctx)?.syncedRecords()) ?? []
  return { sessions, collections }
}

export async function applySnapshot(ctx: Context, snapshot: MirrorSnapshot) {
  const store = sessionsOf(ctx)
  if (store) {
    const current = new Map((await store.listSummaries()).map((item) => [item.id, Number(item.updatedAt) || 0]))
    for (const record of snapshot.sessions ?? []) {
      if (!record?.id) continue
      const known = current.get(record.id) ?? 0
      const incoming = Number(record.updatedAt) || 0
      if (known >= incoming && known > 0) continue
      try {
        await store.save(record)
        claim(ctx, '/sessions', record.id)
      } catch (error) {
        console.warn('[replica] skip session', record.id, error)
      }
    }
  }
  const database = databaseOf(ctx)
  if (!database) return
  for (const collection of snapshot.collections ?? []) {
    await database.applySynced(collection.path, collection.records ?? [])
    for (const record of collection.records ?? []) {
      if (record?.id) claim(ctx, collection.path, String(record.id))
    }
  }
}

export async function exchangeSnapshot(ctx: Context, origin: string, token: string, accountId: string) {
  const root = origin.replace(/\/$/, '')
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const pulled = await fetch(`${root}/api/replica/snapshot`, { headers })
  if (pulled.ok) {
    const body = (await pulled.json()) as MirrorSnapshot
    await runWithAccount(accountId, () => applySnapshot(ctx, body))
  }
  const local = await runWithAccount(accountId, () => takeSnapshot(ctx))
  await fetch(`${root}/api/replica/snapshot`, { method: 'POST', headers, body: JSON.stringify(local) })
}
