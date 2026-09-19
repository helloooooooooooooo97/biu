import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openSqlite } from '@biu/host-plugin-loader/data-dir'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { normalizeCollectionPath } from '../paths.ts'
import type { ShareKind, ShareRecord } from '../share-snapshot.ts'

export type { ShareKind, ShareRecord } from '../share-snapshot.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

type ShareRow = {
  token: string
  kind: string
  collection: string
  view_id: string
  record_id: string
  password_salt: string
  password_hash: string
  share_plugins: number
  allow_copy: number
  created_at: number
  updated_at: number
}

function mintToken() {
  return randomBytes(18).toString('base64url')
}

function hashPassword(password: string, salt = randomBytes(16)) {
  return { salt: salt.toString('hex'), hash: scryptSync(password, salt, 32).toString('hex') }
}

function asKind(value: unknown): ShareKind | '' {
  return value === 'view' || value === 'record' ? value : ''
}

function publicShare(row: ShareRow): ShareRecord {
  return {
    token: row.token,
    kind: asKind(row.kind) || 'view',
    collection: row.collection,
    viewId: row.view_id,
    recordId: row.record_id,
    hasPassword: Boolean(row.password_hash),
    sharePlugins: Boolean(row.share_plugins),
    allowCopy: row.allow_copy !== 0,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }
}

export class SharesStore {
  private db: DatabaseSync | null = null

  open(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = openSqlite(path, { foreignKeys: false })
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        token TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        collection TEXT NOT NULL,
        view_id TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '',
        password_salt TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL DEFAULT '',
        share_plugins INTEGER NOT NULL DEFAULT 0,
        allow_copy INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS shares_target ON shares(kind, collection, view_id, record_id);
    `)
    this.ensureFlagColumns()
    return this
  }

  private ensureFlagColumns() {
    const db = this.db
    if (!db) return
    const cols = db.prepare('PRAGMA table_info(shares)').all() as Array<{ name: string }>
    const names = new Set(cols.map((col) => col.name))
    if (!names.has('share_plugins')) db.exec('ALTER TABLE shares ADD COLUMN share_plugins INTEGER NOT NULL DEFAULT 0')
    if (!names.has('allow_copy')) db.exec('ALTER TABLE shares ADD COLUMN allow_copy INTEGER NOT NULL DEFAULT 1')
  }

  private conn() {
    if (!this.db) this.open(':memory:')
    return this.db!
  }

  get(token: string): ShareRecord | null {
    const row = this.conn().prepare('SELECT * FROM shares WHERE token = ?').get(token) as ShareRow | undefined
    return row ? publicShare(row) : null
  }

  find(kind: ShareKind, collection: string, viewId = '', recordId = ''): ShareRecord | null {
    const row = this.conn().prepare(
      'SELECT * FROM shares WHERE kind = ? AND collection = ? AND view_id = ? AND record_id = ?',
    ).get(kind, normalizeCollectionPath(collection), viewId, recordId) as ShareRow | undefined
    return row ? publicShare(row) : null
  }

  verifyPassword(token: string, password: string) {
    const row = this.conn().prepare('SELECT password_salt, password_hash FROM shares WHERE token = ?').get(token) as
      | { password_salt: string; password_hash: string }
      | undefined
    if (!row) return false
    if (!row.password_hash) return true
    const salt = Buffer.from(row.password_salt, 'hex')
    const expected = Buffer.from(row.password_hash, 'hex')
    const actual = scryptSync(String(password ?? ''), salt, expected.length)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  upsert(input: {
    kind: ShareKind
    collection: string
    viewId?: string
    recordId?: string
    password?: string | null
    sharePlugins?: boolean
    allowCopy?: boolean
  }): ShareRecord {
    const kind = asKind(input.kind)
    if (!kind) throw new Error('invalid share kind')
    const collection = normalizeCollectionPath(input.collection)
    if (!collection || collection === '/') throw new Error('invalid collection')
    const viewId = String(input.viewId ?? '').trim()
    const recordId = String(input.recordId ?? '').trim()
    if (kind === 'record' && !recordId) throw new Error('record share needs recordId')
    const now = Date.now()
    const existing = this.find(kind, collection, viewId, recordId)
    let salt = ''
    let hash = ''
    if (input.password === undefined) {
      if (existing) {
        const row = this.conn().prepare('SELECT password_salt, password_hash FROM shares WHERE token = ?').get(existing.token) as ShareRow
        salt = row.password_salt
        hash = row.password_hash
      }
    } else if (input.password) {
      const next = hashPassword(input.password)
      salt = next.salt
      hash = next.hash
    }
    const sharePlugins = input.sharePlugins ?? existing?.sharePlugins ?? false
    const allowCopy = input.allowCopy ?? existing?.allowCopy ?? true
    const token = existing?.token ?? mintToken()
    this.conn().prepare(`
      INSERT INTO shares (token, kind, collection, view_id, record_id, password_salt, password_hash, share_plugins, allow_copy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, collection, view_id, record_id) DO UPDATE SET
        password_salt=excluded.password_salt,
        password_hash=excluded.password_hash,
        share_plugins=excluded.share_plugins,
        allow_copy=excluded.allow_copy,
        updated_at=excluded.updated_at
    `).run(
      token,
      kind,
      collection,
      viewId,
      recordId,
      salt,
      hash,
      sharePlugins ? 1 : 0,
      allowCopy ? 1 : 0,
      existing?.createdAt ?? now,
      now,
    )
    return this.get(token)!
  }

  revoke(token: string) {
    this.conn().prepare('DELETE FROM shares WHERE token = ?').run(token)
  }

  revokeTarget(kind: ShareKind, collection: string, viewId = '', recordId = '') {
    this.conn().prepare(
      'DELETE FROM shares WHERE kind = ? AND collection = ? AND view_id = ? AND record_id = ?',
    ).run(kind, normalizeCollectionPath(collection), viewId, recordId)
  }

  revokeRecord(collection: string, recordId: string) {
    const id = String(recordId ?? '').trim()
    if (!id) return
    this.conn().prepare('DELETE FROM shares WHERE kind = ? AND collection = ? AND record_id = ?').run(
      'record',
      normalizeCollectionPath(collection),
      id,
    )
  }

  revokeView(collection: string, viewId: string) {
    const id = String(viewId ?? '').trim()
    if (!id) return
    this.conn().prepare('DELETE FROM shares WHERE kind = ? AND collection = ? AND view_id = ?').run(
      'view',
      normalizeCollectionPath(collection),
      id,
    )
  }

  list(): ShareRecord[] {
    const rows = this.conn().prepare('SELECT * FROM shares ORDER BY updated_at DESC, token DESC').all() as ShareRow[]
    return rows.map(publicShare)
  }
}

export function dropSharesForRemovedViews(
  shares: SharesStore,
  collection: string,
  previous: Array<{ id?: string }>,
  next: Array<{ id?: string }>,
) {
  const keep = new Set(next.map((item) => String(item.id ?? '').trim()).filter(Boolean))
  for (const view of previous) {
    const id = String(view.id ?? '').trim()
    if (id && !keep.has(id)) shares.revokeView(collection, id)
  }
}
