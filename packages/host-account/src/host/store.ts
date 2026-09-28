import { randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export const PRESENCE_STALE_MS = 30_000
export const DEFAULT_LOCK_MS = 60_000

export class CollabError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CollabError'
  }
}

export type Account = { id: string; name: string; createdAt: number }
export type Workspace = { id: string; name: string; ownerId: string; role: string; createdAt: number }
export type RecordHead = {
  workspaceId: string
  collection: string
  recordId: string
  ownerId: string
  version: number
  updatedAt: number
}
export type SyncOp = {
  id: number
  workspaceId: string
  collection: string
  recordId: string
  field: string
  value: unknown
  version: number
  authorId: string
  createdAt: number
}
export type EditLock = {
  workspaceId: string
  collection: string
  recordId: string
  accountId: string
  expiresAt: number
}
export type PresenceRow = {
  workspaceId: string
  accountId: string
  name: string
  collection: string
  recordId: string
  seenAt: number
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

export class CollabStore {
  constructor(private db: DatabaseSync) {}

  bootstrapLocal(input: { accountName?: string; workspaceName?: string; now?: number } = {}) {
    const now = input.now ?? Date.now()
    const done = this.db.prepare(`SELECT value FROM collab_state WHERE key = 'bootstrapped'`).get() as
      | { value: string }
      | undefined
    if (done) return { ...this.localSession(), imported: 0, bootstrapped: true }
    const existing = this.db.prepare('SELECT id FROM workspaces ORDER BY created_at LIMIT 1').get() as
      | { id: string }
      | undefined
    if (existing) {
      this.markBootstrapped()
      if (!this.homeWorkspaceId()) this.writeState('home', existing.id)
      if (!this.activeWorkspaceId()) this.writeState('active', existing.id)
      return { ...this.localSession(), imported: 0, bootstrapped: true }
    }
    const accountName = (input.accountName ?? '').trim() || '我'
    const workspaceName = (input.workspaceName ?? '').trim() || '本机'
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const account = this.register(accountName, now)
      const workspace = this.createWorkspace(account.id, workspaceName, now, false)
      const imported = this.importLiveRecords(workspace.id, account.id, now)
      this.markBootstrapped()
      this.writeState('home', workspace.id)
      this.writeState('active', workspace.id)
      this.db.exec('COMMIT')
      return {
        account: { id: account.id, name: account.name, createdAt: account.createdAt },
        token: account.token,
        workspace,
        imported,
        bootstrapped: false,
      }
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  register(name: string, now = Date.now()): Account & { token: string } {
    const trimmed = name.trim()
    if (!trimmed) throw new CollabError('名字不能为空', 400)
    const account = { id: id('acc'), name: trimmed, token: randomBytes(24).toString('hex'), createdAt: now }
    this.db
      .prepare('INSERT INTO accounts (id, name, token, created_at) VALUES (?, ?, ?, ?)')
      .run(account.id, account.name, account.token, account.createdAt)
    return account
  }

  accountByToken(token: string): Account | null {
    const row = this.db
      .prepare('SELECT id, name, created_at FROM accounts WHERE token = ?')
      .get(token) as { id: string; name: string; created_at: number } | undefined
    if (!row) return null
    return { id: row.id, name: row.name, createdAt: row.created_at }
  }

  createWorkspace(ownerId: string, name: string, now = Date.now(), ownTransaction = true): Workspace {
    this.requireAccount(ownerId)
    const trimmed = name.trim()
    if (!trimmed) throw new CollabError('工作区名字不能为空', 400)
    const workspace = { id: id('ws'), name: trimmed, ownerId, createdAt: now }
    const write = () => {
      this.db
        .prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
        .run(workspace.id, workspace.name, ownerId, now)
      this.db
        .prepare(
          'INSERT INTO workspace_members (workspace_id, account_id, role, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(workspace.id, ownerId, 'owner', now)
    }
    if (!ownTransaction) {
      write()
      return { ...workspace, role: 'owner' }
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      write()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return { ...workspace, role: 'owner' }
  }

  addMember(actorId: string, workspaceId: string, accountId: string, now = Date.now()) {
    this.requireRole(actorId, workspaceId, 'owner')
    this.requireAccount(accountId)
    this.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, account_id, role, created_at)
         VALUES (?, ?, 'member', ?)
         ON CONFLICT(workspace_id, account_id) DO NOTHING`,
      )
      .run(workspaceId, accountId, now)
    return this.members(actorId, workspaceId)
  }

  members(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId)
    return this.db
      .prepare(
        `SELECT a.id, a.name, m.role, m.created_at
         FROM workspace_members m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.workspace_id = ?
         ORDER BY m.created_at`,
      )
      .all(workspaceId) as Array<{ id: string; name: string; role: string; created_at: number }>
  }

  listWorkspaces(accountId: string): Workspace[] {
    const rows = this.db
      .prepare(
        `SELECT w.id, w.name, w.owner_id, w.created_at, m.role
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.account_id = ?
         ORDER BY w.created_at`,
      )
      .all(accountId) as Array<{ id: string; name: string; owner_id: string; created_at: number; role: string }>
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      role: row.role,
      createdAt: row.created_at,
    }))
  }

  claim(actorId: string, workspaceId: string, collection: string, recordId: string, now = Date.now()): RecordHead {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const current = this.head(workspaceId, key.collection, key.recordId)
      if (!current) {
        this.db
          .prepare(
            `INSERT INTO record_owners
             (workspace_id, collection, record_id, owner_id, version, updated_at)
             VALUES (?, ?, ?, ?, 0, ?)`,
          )
          .run(workspaceId, key.collection, key.recordId, actorId, now)
      } else if (current.ownerId !== actorId) {
        throw new CollabError('这条记录已经有归属', 409)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* already rolled back by sqlite on throw inside */
      }
      throw error
    }
    return this.head(workspaceId, key.collection, key.recordId)!
  }

  sync(input: {
    actorId: string
    workspaceId: string
    collection: string
    recordId: string
    field: string
    value: unknown
    expectedVersion: number
    now?: number
  }): SyncOp {
    const now = input.now ?? Date.now()
    this.requireMember(input.actorId, input.workspaceId)
    const key = this.recordKey(input.collection, input.recordId)
    const field = input.field.trim()
    if (!field) throw new CollabError('字段不能为空', 400)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.assertLockFree(input.actorId, input.workspaceId, key.collection, key.recordId, now)
      const current = this.head(input.workspaceId, key.collection, key.recordId)
      const version = current?.version ?? 0
      if (input.expectedVersion !== version) {
        throw new CollabError(`版本冲突：期望 v${input.expectedVersion}，当前为 v${version}`, 409)
      }
      const next = version + 1
      if (!current) {
        this.db
          .prepare(
            `INSERT INTO record_owners
             (workspace_id, collection, record_id, owner_id, version, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(input.workspaceId, key.collection, key.recordId, input.actorId, next, now)
      } else {
        this.db
          .prepare(
            `UPDATE record_owners SET version = ?, updated_at = ?
             WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .run(next, now, input.workspaceId, key.collection, key.recordId)
      }
      const inserted = this.db
        .prepare(
          `INSERT INTO sync_ops
           (workspace_id, collection, record_id, field, value_json, version, author_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.workspaceId,
          key.collection,
          key.recordId,
          field,
          JSON.stringify(input.value ?? null),
          next,
          input.actorId,
          now,
        )
      this.db.exec('COMMIT')
      return {
        id: Number(inserted.lastInsertRowid),
        workspaceId: input.workspaceId,
        collection: key.collection,
        recordId: key.recordId,
        field,
        value: input.value ?? null,
        version: next,
        authorId: input.actorId,
        createdAt: now,
      }
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  opsSince(actorId: string, workspaceId: string, after = 0): SyncOp[] {
    this.requireMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, collection, record_id, field, value_json, version, author_id, created_at
         FROM sync_ops
         WHERE workspace_id = ? AND id > ?
         ORDER BY id
         LIMIT 200`,
      )
      .all(workspaceId, after) as Array<{
      id: number
      workspace_id: string
      collection: string
      record_id: string
      field: string
      value_json: string
      version: number
      author_id: string
      created_at: number
    }>
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      collection: row.collection,
      recordId: row.record_id,
      field: row.field,
      value: JSON.parse(row.value_json) as unknown,
      version: row.version,
      authorId: row.author_id,
      createdAt: row.created_at,
    }))
  }

  acquireLock(
    actorId: string,
    workspaceId: string,
    collection: string,
    recordId: string,
    ttlMs = DEFAULT_LOCK_MS,
    now = Date.now(),
  ): EditLock {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    const expiresAt = now + Math.max(1000, ttlMs)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const held = this.lockRow(workspaceId, key.collection, key.recordId)
      if (held && held.expiresAt > now && held.accountId !== actorId) {
        throw new CollabError('这条记录正被别人编辑', 409)
      }
      this.db
        .prepare(
          `INSERT INTO edit_locks (workspace_id, collection, record_id, account_id, expires_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id, collection, record_id)
           DO UPDATE SET account_id = excluded.account_id, expires_at = excluded.expires_at`,
        )
        .run(workspaceId, key.collection, key.recordId, actorId, expiresAt)
      this.db.exec('COMMIT')
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
    return { workspaceId, collection: key.collection, recordId: key.recordId, accountId: actorId, expiresAt }
  }

  releaseLock(actorId: string, workspaceId: string, collection: string, recordId: string) {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    this.db
      .prepare(
        `DELETE FROM edit_locks
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND account_id = ?`,
      )
      .run(workspaceId, key.collection, key.recordId, actorId)
  }

  pulse(
    actorId: string,
    workspaceId: string,
    collection = '',
    recordId = '',
    now = Date.now(),
  ): PresenceRow {
    this.requireMember(actorId, workspaceId)
    const account = this.requireAccount(actorId)
    this.db
      .prepare(
        `INSERT INTO presence (workspace_id, account_id, collection, record_id, seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, account_id)
         DO UPDATE SET collection = excluded.collection, record_id = excluded.record_id, seen_at = excluded.seen_at`,
      )
      .run(workspaceId, actorId, collection, recordId, now)
    return {
      workspaceId,
      accountId: actorId,
      name: account.name,
      collection,
      recordId,
      seenAt: now,
    }
  }

  presence(actorId: string, workspaceId: string, now = Date.now()): PresenceRow[] {
    this.requireMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT p.workspace_id, p.account_id, a.name, p.collection, p.record_id, p.seen_at
         FROM presence p
         JOIN accounts a ON a.id = p.account_id
         WHERE p.workspace_id = ? AND p.seen_at >= ?
         ORDER BY p.seen_at DESC`,
      )
      .all(workspaceId, now - PRESENCE_STALE_MS) as Array<{
      workspace_id: string
      account_id: string
      name: string
      collection: string
      record_id: string
      seen_at: number
    }>
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      accountId: row.account_id,
      name: row.name,
      collection: row.collection,
      recordId: row.record_id,
      seenAt: row.seen_at,
    }))
  }

  activeWorkspaceId() {
    return this.stateValue('active')
  }

  homeWorkspaceId() {
    return this.stateValue('home')
  }

  membership() {
    const active = this.activeWorkspaceId()
    const home = this.homeWorkspaceId()
    const rows = this.db
      .prepare('SELECT workspace_id, collection, record_id FROM record_owners')
      .all() as Array<{ workspace_id: string; collection: string; record_id: string }>
    const mine = new Set<string>()
    const any = new Set<string>()
    for (const row of rows) {
      const key = `${row.collection}\t${row.record_id}`
      any.add(key)
      if (row.workspace_id === active) mine.add(key)
    }
    return { active, home, mine, any }
  }

  private stateValue(key: string) {
    const row = this.db.prepare('SELECT value FROM collab_state WHERE key = ?').get(key) as { value?: string } | undefined
    return row?.value || null
  }

  setActive(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId)
    this.writeState('active', workspaceId)
    return workspaceId
  }

  recordIds(workspaceId: string, collection: string) {
    const rows = this.db
      .prepare('SELECT record_id FROM record_owners WHERE workspace_id = ? AND collection = ?')
      .all(workspaceId, collection) as Array<{ record_id: string }>
    return new Set(rows.map((row) => row.record_id))
  }

  attach(workspaceId: string, collection: string, recordId: string, now = Date.now()) {
    const owner = this.db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId) as
      | { owner_id: string }
      | undefined
    if (!owner) throw new CollabError('工作区不存在', 404)
    this.db
      .prepare(
        `INSERT INTO record_owners (workspace_id, collection, record_id, owner_id, version, updated_at)
         VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT(workspace_id, collection, record_id) DO NOTHING`,
      )
      .run(workspaceId, collection, recordId, owner.owner_id, now)
  }

  private writeState(key: string, value: string) {
    this.db
      .prepare(`INSERT INTO collab_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, value)
  }

  private markBootstrapped() {
    this.writeState('bootstrapped', '1')
  }

  private localSession() {
    const row = this.db
      .prepare(
        `SELECT a.id, a.name, a.token, a.created_at, w.id AS workspace_id, w.name AS workspace_name, w.owner_id, w.created_at AS workspace_created
         FROM workspaces w
         JOIN accounts a ON a.id = w.owner_id
         ORDER BY w.created_at
         LIMIT 1`,
      )
      .get() as
      | {
          id: string
          name: string
          token: string
          created_at: number
          workspace_id: string
          workspace_name: string
          owner_id: string
          workspace_created: number
        }
      | undefined
    if (!row) throw new CollabError('还没有本地工作区', 404)
    return {
      account: { id: row.id, name: row.name, createdAt: row.created_at },
      token: row.token,
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        ownerId: row.owner_id,
        role: 'owner',
        createdAt: row.workspace_created,
      },
    }
  }

  private importLiveRecords(workspaceId: string, ownerId: string, now: number) {
    const inserted = this.db
      .prepare(
        `INSERT INTO record_owners (workspace_id, collection, record_id, owner_id, version, updated_at)
         SELECT ?, live.collection, live.record_id, ?, 0, ?
         FROM (
           SELECT '/pages' AS collection, id AS record_id FROM pages
           UNION
           SELECT '/tasks', id FROM tasks
           UNION
           SELECT '/sessions', id FROM sessions
           UNION
           SELECT collection, record_id FROM editor_content
           WHERE collection IN ('/skills', '/plugins')
           UNION
           SELECT collection, record_id FROM record_meta
           WHERE collection IN ('/pages', '/tasks', '/sessions', '/skills', '/plugins')
         ) AS live
         WHERE NOT EXISTS (
           SELECT 1 FROM record_meta AS meta
           WHERE meta.collection = live.collection
             AND meta.record_id = live.record_id
             AND meta.deleted_at IS NOT NULL
             AND meta.deleted_at > 0
         )`,
      )
      .run(workspaceId, ownerId, now)
    return Number(inserted.changes)
  }

  private requireAccount(accountId: string) {
    const row = this.db.prepare('SELECT id, name, created_at FROM accounts WHERE id = ?').get(accountId) as
      | { id: string; name: string; created_at: number }
      | undefined
    if (!row) throw new CollabError('账号不存在', 404)
    return { id: row.id, name: row.name, createdAt: row.created_at }
  }

  private requireMember(accountId: string, workspaceId: string) {
    const row = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string } | undefined
    if (!row) throw new CollabError('不是这个工作区的成员', 403)
    return row.role
  }

  private requireRole(accountId: string, workspaceId: string, role: string) {
    const actual = this.requireMember(accountId, workspaceId)
    if (actual !== role) throw new CollabError('只有所有者可以这样做', 403)
  }

  private recordKey(collection: string, recordId: string) {
    const normalized = collection.trim()
    const idPart = recordId.trim()
    if (!normalized.startsWith('/') || normalized.includes('..') || !idPart || idPart.includes('/')) {
      throw new CollabError('记录路径不合法', 400)
    }
    return { collection: normalized, recordId: idPart }
  }

  private head(workspaceId: string, collection: string, recordId: string): RecordHead | null {
    const row = this.db
      .prepare(
        `SELECT workspace_id, collection, record_id, owner_id, version, updated_at
         FROM record_owners
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as
      | {
          workspace_id: string
          collection: string
          record_id: string
          owner_id: string
          version: number
          updated_at: number
        }
      | undefined
    if (!row) return null
    return {
      workspaceId: row.workspace_id,
      collection: row.collection,
      recordId: row.record_id,
      ownerId: row.owner_id,
      version: row.version,
      updatedAt: row.updated_at,
    }
  }

  private lockRow(workspaceId: string, collection: string, recordId: string): EditLock | null {
    const row = this.db
      .prepare(
        `SELECT workspace_id, collection, record_id, account_id, expires_at
         FROM edit_locks
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as
      | {
          workspace_id: string
          collection: string
          record_id: string
          account_id: string
          expires_at: number
        }
      | undefined
    if (!row) return null
    return {
      workspaceId: row.workspace_id,
      collection: row.collection,
      recordId: row.record_id,
      accountId: row.account_id,
      expiresAt: row.expires_at,
    }
  }

  private assertLockFree(actorId: string, workspaceId: string, collection: string, recordId: string, now: number) {
    const held = this.lockRow(workspaceId, collection, recordId)
    if (held && held.expiresAt > now && held.accountId !== actorId) {
      throw new CollabError('这条记录正被别人编辑', 409)
    }
  }
}
