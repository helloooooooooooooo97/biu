import type { DatabaseSync } from 'node:sqlite'
import { CollabError, CollabStore, type SyncOp } from './store.ts'

export type ReplicaRecord = {
  workspaceId: string
  collection: string
  recordId: string
  field: string
  value: unknown
  version: number
  dirty: boolean
  conflict: unknown | null
}

type Device = { accountId: string; workspaceId: string; token: string }

export type RemoteSync = {
  push(input: {
    token: string
    accountId: string
    workspaceId: string
    collection: string
    recordId: string
    field: string
    value: unknown
    expectedVersion: number
  }): Promise<{ ok: true; op: SyncOp } | { ok: false; version: number; value: unknown }>
  pull(input: { token: string; accountId: string; workspaceId: string; after: number }): Promise<SyncOp[]>
}

const SKIP_COLLECTIONS = new Set(['/.plugin', '/.plugin-dev'])

export function storeRemote(store: CollabStore): RemoteSync {
  return {
    async push(input) {
      try {
        const op = store.sync({
          actorId: input.accountId,
          workspaceId: input.workspaceId,
          collection: input.collection,
          recordId: input.recordId,
          field: input.field,
          value: input.value,
          expectedVersion: input.expectedVersion,
        })
        return { ok: true, op }
      } catch (error) {
        if (!(error instanceof CollabError) || error.status !== 409) throw error
        const current = store.fieldValue(
          input.accountId,
          input.workspaceId,
          input.collection,
          input.recordId,
          input.field,
        )
        return { ok: false, version: current?.version ?? input.expectedVersion, value: current?.value ?? null }
      }
    },
    async pull(input) {
      return store.visibleOpsSince(input.accountId, input.workspaceId, input.after)
    },
  }
}

export function httpRemote(origin: string): RemoteSync {
  const root = origin.replace(/\/$/, '')
  return {
    async push(input) {
      const res = await fetch(`${root}/api/account/sync`, {
        method: 'POST',
        headers: { authorization: `Bearer ${input.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: input.workspaceId,
          collection: input.collection,
          recordId: input.recordId,
          field: input.field,
          value: input.value,
          expectedVersion: input.expectedVersion,
        }),
      })
      if (res.status === 409) {
        const ops = await this.pull({ ...input, after: 0 })
        const latest = [...ops].reverse().find((op) => op.collection === input.collection && op.recordId === input.recordId && op.field === input.field)
        return { ok: false, version: latest?.version ?? input.expectedVersion, value: latest?.value ?? null }
      }
      if (!res.ok) throw new Error(`push failed: ${res.status}`)
      return { ok: true, op: (await res.json()) as SyncOp }
    },
    async pull(input) {
      const url = new URL(`${root}/api/account/sync`)
      url.searchParams.set('workspaceId', input.workspaceId)
      url.searchParams.set('after', String(input.after))
      url.searchParams.set('visible', '1')
      const res = await fetch(url, { headers: { authorization: `Bearer ${input.token}` } })
      if (!res.ok) throw new Error(`pull failed: ${res.status}`)
      const body = (await res.json()) as { ops: SyncOp[] }
      return body.ops
    },
  }
}

/** 桌面端副本。只保存这台机器登录过的账号有权阅读的记录。 */
export class RecordReplica {
  private activeId = ''

  constructor(
    private db: DatabaseSync,
    private remote: RemoteSync,
  ) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS replica_devices (
        account_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        token TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS replica_cursors (
        account_id TEXT PRIMARY KEY,
        op_id INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS replica_records (
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        dirty INTEGER NOT NULL,
        conflict_json TEXT,
        PRIMARY KEY (workspace_id, collection, record_id, field)
      );
      CREATE TABLE IF NOT EXISTS replica_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value_json TEXT NOT NULL,
        base_version INTEGER NOT NULL,
        state TEXT NOT NULL
      );
    `)
  }

  remember(device: Device) {
    this.db
      .prepare(
        `INSERT INTO replica_devices (account_id, workspace_id, token) VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET workspace_id = excluded.workspace_id, token = excluded.token`,
      )
      .run(device.accountId, device.workspaceId, device.token)
    this.activeId = device.accountId
  }

  active() {
    return this.devices().find((item) => item.accountId === this.activeId) ?? null
  }

  devices(): Device[] {
    const rows = this.db
      .prepare('SELECT account_id, workspace_id, token FROM replica_devices ORDER BY account_id')
      .all() as Array<{ account_id: string; workspace_id: string; token: string }>
    return rows.map((row) => ({ accountId: row.account_id, workspaceId: row.workspace_id, token: row.token }))
  }

  enqueue(input: {
    accountId: string
    workspaceId: string
    collection: string
    recordId: string
    field: string
    value: unknown
  }) {
    if (SKIP_COLLECTIONS.has(input.collection) || input.field === 'secret') return null
    const device = this.devices().find((item) => item.accountId === input.accountId && item.workspaceId === input.workspaceId)
    if (!device) return null
    const current = this.read(input.workspaceId, input.collection, input.recordId, input.field)
    const base = current?.dirty ? current.version : (current?.version ?? 0)
    this.writeLocal({ ...input, version: base, dirty: true, conflict: current?.conflict ?? null })
    this.db
      .prepare(
        `INSERT INTO replica_outbox
         (account_id, workspace_id, collection, record_id, field, value_json, base_version, state)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .run(input.accountId, input.workspaceId, input.collection, input.recordId, input.field, JSON.stringify(input.value ?? null), base)
    return this.read(input.workspaceId, input.collection, input.recordId, input.field)
  }

  /** 回合结束后才入队。进行中的工具调用不进这里。 */
  enqueueFinishedSession(input: { accountId: string; workspaceId: string; sessionId: string; text: string }) {
    return this.enqueue({
      accountId: input.accountId,
      workspaceId: input.workspaceId,
      collection: '/sessions',
      recordId: input.sessionId,
      field: 'transcript',
      value: input.text,
    })
  }

  read(workspaceId: string, collection: string, recordId: string, field: string): ReplicaRecord | null {
    const row = this.db
      .prepare(
        `SELECT workspace_id, collection, record_id, field, value_json, version, dirty, conflict_json
         FROM replica_records
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND field = ?`,
      )
      .get(workspaceId, collection, recordId, field) as
      | {
          workspace_id: string
          collection: string
          record_id: string
          field: string
          value_json: string
          version: number
          dirty: number
          conflict_json: string | null
        }
      | undefined
    if (!row) return null
    return {
      workspaceId: row.workspace_id,
      collection: row.collection,
      recordId: row.record_id,
      field: row.field,
      value: JSON.parse(row.value_json) as unknown,
      version: row.version,
      dirty: row.dirty === 1,
      conflict: row.conflict_json ? (JSON.parse(row.conflict_json) as unknown) : null,
    }
  }

  async flush() {
    const rows = this.db
      .prepare(
        `SELECT id, account_id, workspace_id, collection, record_id, field, value_json, base_version
         FROM replica_outbox WHERE state = 'pending' ORDER BY id`,
      )
      .all() as Array<{
      id: number
      account_id: string
      workspace_id: string
      collection: string
      record_id: string
      field: string
      value_json: string
      base_version: number
    }>
    for (const row of rows) {
      const device = this.devices().find((item) => item.accountId === row.account_id)
      if (!device) continue
      const result = await this.remote.push({
        token: device.token,
        accountId: device.accountId,
        workspaceId: row.workspace_id,
        collection: row.collection,
        recordId: row.record_id,
        field: row.field,
        value: JSON.parse(row.value_json) as unknown,
        expectedVersion: row.base_version,
      })
      if (result.ok) {
        this.writeLocal({
          workspaceId: row.workspace_id,
          collection: row.collection,
          recordId: row.record_id,
          field: row.field,
          value: JSON.parse(row.value_json) as unknown,
          version: result.op.version,
          dirty: false,
          conflict: null,
        })
        this.db.prepare(`DELETE FROM replica_outbox WHERE id = ?`).run(row.id)
      } else {
        this.db.prepare(`UPDATE replica_outbox SET state = 'conflict' WHERE id = ?`).run(row.id)
        const local = this.read(row.workspace_id, row.collection, row.record_id, row.field)
        this.writeLocal({
          workspaceId: row.workspace_id,
          collection: row.collection,
          recordId: row.record_id,
          field: row.field,
          value: local?.value ?? null,
          version: local?.version ?? row.base_version,
          dirty: true,
          conflict: result.value,
        })
      }
    }
  }

  async pull() {
    for (const device of this.devices()) {
      let after = this.cursor(device.accountId)
      for (;;) {
        const ops = await this.remote.pull({
          token: device.token,
          accountId: device.accountId,
          workspaceId: device.workspaceId,
          after,
        })
        if (!ops.length) break
        for (const op of ops) {
          after = Math.max(after, op.id)
          if (this.pending(device.workspaceId, op.collection, op.recordId, op.field)) continue
          this.writeLocal({
            workspaceId: device.workspaceId,
            collection: op.collection,
            recordId: op.recordId,
            field: op.field,
            value: op.value,
            version: op.version,
            dirty: false,
            conflict: null,
          })
        }
        this.setCursor(device.accountId, after)
        if (ops.length < 200) break
      }
    }
  }

  private pending(workspaceId: string, collection: string, recordId: string, field: string) {
    const row = this.db
      .prepare(
        `SELECT 1 AS ok FROM replica_outbox
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND field = ? AND state = 'pending' LIMIT 1`,
      )
      .get(workspaceId, collection, recordId, field) as { ok: number } | undefined
    return Boolean(row)
  }

  private cursor(accountId: string) {
    const row = this.db.prepare('SELECT op_id FROM replica_cursors WHERE account_id = ?').get(accountId) as
      | { op_id: number }
      | undefined
    return row?.op_id ?? 0
  }

  private setCursor(accountId: string, opId: number) {
    this.db
      .prepare(
        `INSERT INTO replica_cursors (account_id, op_id) VALUES (?, ?)
         ON CONFLICT(account_id) DO UPDATE SET op_id = excluded.op_id`,
      )
      .run(accountId, opId)
  }

  private writeLocal(input: ReplicaRecord) {
    this.db
      .prepare(
        `INSERT INTO replica_records
         (workspace_id, collection, record_id, field, value_json, version, dirty, conflict_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, record_id, field) DO UPDATE SET
           value_json = excluded.value_json,
           version = excluded.version,
           dirty = excluded.dirty,
           conflict_json = excluded.conflict_json`,
      )
      .run(
        input.workspaceId,
        input.collection,
        input.recordId,
        input.field,
        JSON.stringify(input.value ?? null),
        input.version,
        input.dirty ? 1 : 0,
        input.conflict === null || input.conflict === undefined ? null : JSON.stringify(input.conflict),
      )
  }
}
