import { randomBytes } from 'node:crypto'
import type { Context } from 'cordis'
import { runWithAccount } from '@biu/host-plugin-loader/data-dir'
import type { SessionRecord } from '@biu/type-session'

export type MirrorSnapshot = {
  sessions: Array<SessionRecord & { updatedAt?: number }>
  collections: Array<{ path: string; records: Array<Record<string, unknown> & { id: string; updatedAt?: number }> }>
}

type ApplyMode = 'cache' | 'adopt'

type SessionStoreLike = {
  listSummaries: () => Promise<Array<{ id: string; updatedAt?: number }>>
  load: (id: string) => Promise<SessionRecord | null | undefined>
  save: (record: SessionRecord & { updatedAt?: number }) => Promise<void>
  delete?: (id: string) => Promise<unknown>
}

type DatabaseLike = {
  syncedRecords: () => Promise<MirrorSnapshot['collections']>
  applySynced: (path: string, records: MirrorSnapshot['collections'][number]['records']) => Promise<void>
  read?: (path: string) => Promise<{ value?: Record<string, unknown> & { id?: string } }>
  remove?: (path: string, query: { ids: string[] }) => Promise<unknown>
}

type AccountLike = {
  isRemote?: (collection: string, id: string) => boolean
  markRemote?: (collection: string, id: string) => void
  clearPlace?: (collection: string, id: string) => void
  remoteIds?: (collection: string) => string[]
  copiedCloud?: (collection: string, id: string) => string
  rememberCopy?: (collection: string, localId: string, cloudId: string) => void
  replica?: { active?: () => { token?: string; accountId?: string } | null }
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

function accountOf(ctx: Context) {
  try {
    return ctx.get('account') as AccountLike | undefined
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

function rememberCloud(ctx: Context, collection: string, id: string) {
  accountOf(ctx)?.markRemote?.(collection, id)
}

export function isCloudRecord(ctx: Context, collection: string, id: string) {
  return Boolean(accountOf(ctx)?.isRemote?.(collection, id))
}

export function cloudCopyId(collection: string) {
  const hex = randomBytes(8).toString('hex')
  return collection === '/tasks' ? `task_${hex}` : `c${hex}`
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

export async function applySnapshot(ctx: Context, snapshot: MirrorSnapshot, mode: ApplyMode = 'cache') {
  const account = accountOf(ctx)
  const store = sessionsOf(ctx)
  if (store) {
    const current = new Set((await store.listSummaries()).map((item) => item.id))
    const incoming = new Set<string>()
    for (const record of snapshot.sessions ?? []) {
      if (!record?.id) continue
      incoming.add(record.id)
      const localHome = current.has(record.id) && !account?.isRemote?.('/sessions', record.id)
      if (mode === 'cache' && localHome) continue
      try {
        await store.save(record)
        claim(ctx, '/sessions', record.id)
        if (mode === 'cache') rememberCloud(ctx, '/sessions', record.id)
      } catch (error) {
        console.warn('[replica] skip session', record.id, error)
      }
    }
    if (mode === 'cache') {
      for (const id of account?.remoteIds?.('/sessions') ?? []) {
        if (incoming.has(id)) continue
        await store.delete?.(id)
        account?.clearPlace?.('/sessions', id)
      }
    }
  }
  const database = databaseOf(ctx)
  if (!database) return
  for (const collection of snapshot.collections ?? []) {
    const incoming = new Set<string>()
    const writable = []
    for (const record of collection.records ?? []) {
      const id = String(record?.id ?? '')
      if (!id) continue
      incoming.add(id)
      if (mode === 'cache' && account?.isRemote && !account.isRemote(collection.path, id)) {
        const existing = await database.read?.(`${collection.path}/${id}`).catch(() => null)
        if (existing?.value?.id) continue
      }
      writable.push(record)
    }
    await database.applySynced(collection.path, writable)
    for (const record of writable) {
      if (!record?.id) continue
      claim(ctx, collection.path, String(record.id))
      if (mode === 'cache') rememberCloud(ctx, collection.path, String(record.id))
    }
    if (mode === 'cache') {
      for (const id of account?.remoteIds?.(collection.path) ?? []) {
        if (incoming.has(id)) continue
        await database.remove?.(collection.path, { ids: [id] }).catch((error) => {
          console.warn('[replica] drop', collection.path, id, error)
        })
        account?.clearPlace?.(collection.path, id)
      }
    }
  }
}

export async function exchangeSnapshot(ctx: Context, origin: string, token: string, accountId: string) {
  const root = origin.replace(/\/$/, '')
  const headers = { authorization: `Bearer ${token}` }
  const pulled = await fetch(`${root}/api/replica/snapshot`, { headers })
  if (!pulled.ok) return
  const body = (await pulled.json()) as MirrorSnapshot
  await runWithAccount(accountId, () => applySnapshot(ctx, body, 'cache'))
}

function cloudLogin(ctx: Context) {
  const origin = process.env.BIU_REMOTE_ORIGIN?.replace(/\/$/, '')
  if (process.env.BIU_ONLINE === '1' || !origin) return null
  const account = accountOf(ctx)
  const token = account?.replica?.active?.()?.token
  if (!token) throw new Error('需要登录云端才能分享')
  return { origin, token, accountId: account?.replica?.active?.()?.accountId || '' }
}

export async function publishToCloud(ctx: Context, collection: string, ids: string[]) {
  const linked: Record<string, string> = {}
  const login = cloudLogin(ctx)
  if (!login || !ids.length) return linked
  const unique = [...new Set(ids.map((id) => String(id)).filter(Boolean))]
  const account = accountOf(ctx)
  const pending: string[] = []
  for (const id of unique) {
    if (account?.isRemote?.(collection, id)) {
      linked[id] = id
      continue
    }
    const copied = account?.copiedCloud?.(collection, id)
    if (copied) {
      linked[id] = copied
      continue
    }
    pending.push(id)
  }
  if (!pending.length) return linked
  const sessions: MirrorSnapshot['sessions'] = []
  const records: MirrorSnapshot['collections'][number]['records'] = []
  if (collection === '/sessions') {
    const store = sessionsOf(ctx)
    for (const id of pending) {
      const full = await store?.load(id)
      if (!full) continue
      const copy = { ...full, id: cloudCopyId(collection), updatedAt: Date.now() }
      sessions.push(copy)
      linked[id] = copy.id
    }
  } else {
    const database = databaseOf(ctx)
    const found = (await database?.syncedRecords())?.find((item) => item.path === collection)
    for (const id of pending) {
      const source = found?.records.find((record) => String(record.id) === id)
      if (!source) continue
      const copy = { ...source, id: cloudCopyId(collection), updatedAt: Date.now() }
      delete (copy as { remote?: unknown }).remote
      records.push(copy)
      linked[id] = copy.id
    }
  }
  const snapshot: MirrorSnapshot = {
    sessions,
    collections: records.length ? [{ path: collection, records }] : [],
  }
  const res = await fetch(`${login.origin}/api/replica/snapshot`, {
    method: 'POST',
    headers: { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || '上传到云端失败')
  }
  const store = sessionsOf(ctx)
  for (const copy of sessions) {
    await store?.save(copy)
    account?.markRemote?.('/sessions', copy.id)
  }
  if (records.length) await databaseOf(ctx)?.applySynced(collection, records)
  for (const [localId, cloudId] of Object.entries(linked)) {
    if (pending.includes(localId)) {
      account?.markRemote?.(collection, cloudId)
      account?.rememberCopy?.(collection, localId, cloudId)
    }
  }
  return linked
}

export async function forwardCloud(
  ctx: Context,
  collection: string,
  id: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown } | null> {
  if (process.env.BIU_ONLINE === '1' || !process.env.BIU_REMOTE_ORIGIN) return null
  if (!accountOf(ctx)?.isRemote?.(collection, id)) return null
  const login = cloudLogin(ctx)
  if (!login) return null
  const res = await fetch(`${login.origin}${path}`, {
    method: init.method ?? 'POST',
    headers: {
      authorization: `Bearer ${login.token}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}
