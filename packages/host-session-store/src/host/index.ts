import { dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'
import { Service, type Context } from 'cordis'
import {
  type SessionRecord,
  type SessionStore,
  type SessionSummary,
  lastSpokenAt,
  sessionDisplayTitle,
} from '@biu/type-session'

function toSummary(record: SessionRecord, updatedAt?: number): SessionSummary {
  const touched = updatedAt ?? record.events.at(-1)?.ts ?? 0
  const spoken = lastSpokenAt(record.events)
  const createdAt = Number(record.config?.createdAt)
  const stamp = Number.isFinite(createdAt) && createdAt > 0 ? createdAt : (record.events[0]?.ts ?? touched)
  return {
    id: record.id,
    version: record.version,
    eventCount: record.events.length,
    title: sessionDisplayTitle(record),
    updatedAt: touched,
    ...(spoken > 0 ? { lastMessageAt: spoken } : {}),
    ...(record.project ? { project: record.project } : {}),
    ...(record.mascot ? { mascot: record.mascot } : {}),
    ...(record.config || stamp
      ? { config: { ...(record.config ?? {}), ...(stamp ? { createdAt: stamp } : {}) } }
      : {}),
  }
}

export class MemorySessionStore implements SessionStore {
  private records = new Map<string, SessionRecord>()
  private touched = new Map<string, number>()

  async load(id: string) {
    return this.records.get(id)
  }

  async save(record: SessionRecord) {
    this.records.set(record.id, { ...record, events: [...record.events] })
    this.touched.set(record.id, Date.now())
  }

  async list() {
    return [...this.records.keys()]
  }

  async listSummaries() {
    return [...this.records.values()]
      .map((record) => toSummary(record, this.touched.get(record.id)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async delete(id: string) {
    this.touched.delete(id)
    return this.records.delete(id)
  }
}

export class SessionStoreService extends Service implements SessionStore {
  constructor(
    ctx: Context,
    private inner: SessionStore,
  ) {
    super(ctx, 'sessionStore')
  }

  load(id: string) {
    return this.inner.load(id)
  }

  save(record: SessionRecord) {
    return this.inner.save(record)
  }

  list() {
    return this.inner.list()
  }

  listSummaries() {
    return this.inner.listSummaries()
  }

  delete(id: string) {
    return this.inner.delete(id)
  }
}

export const name = 'session-store'
export const inject = [] as const

export type SessionStoreDriver = 'memory' | 'sqlite'

export async function apply(
  ctx: Context,
  config: { driver?: SessionStoreDriver; path?: string; eventsPath?: string } = {},
) {
  const envDriver = process.env.CORDIS_SESSION_STORE as SessionStoreDriver | undefined
  const driver = config.driver ?? (envDriver === 'memory' || envDriver === 'sqlite' ? envDriver : 'sqlite')
  const sqlitePath = config.path ?? dataPath(dataHome(), 'biu.sqlite')
  const eventsPath = config.eventsPath ?? (config.path ? undefined : dataPath(dataHome(), 'events.sqlite'))

  let inner: SessionStore
  if (driver === 'memory') {
    inner = new MemorySessionStore()
  } else {
    const { ensureSqliteSessionStore } = await import('./sqlite-session-store.ts')
    inner = await ensureSqliteSessionStore(sqlitePath, eventsPath)
  }
  new SessionStoreService(ctx, inner)
}
