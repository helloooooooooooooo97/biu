import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import { canEdit, isRole, type MemberRole } from './session.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type PageShare = {
  token: string
  pageId: string
  role: MemberRole
  createdAt: number
  createdBy: string
}

export function isShareRole(value: unknown): value is MemberRole {
  return value === 'editor' || value === 'viewer'
}

export class SharesStore {
  private db: DatabaseSync

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true })
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    this.db = new DatabaseSync(file)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        token_hash TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        created_by TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS shares_page ON shares(page_id);
    `)
  }

  create(pageId: string, role: MemberRole, createdBy: string): PageShare {
    const id = String(pageId ?? '').trim()
    if (!id) throw new Error('page required')
    if (!isShareRole(role)) throw new Error('share must be editor or viewer')
    const existing = this.list(id).find((row) => row.role === role)
    if (existing) return existing
    const token = randomBytes(18).toString('base64url')
    const createdAt = Date.now()
    this.db
      .prepare('INSERT INTO shares (token_hash, page_id, role, created_at, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(hashToken(token), id, role, createdAt, createdBy)
    return { token, pageId: id, role, createdAt, createdBy }
  }

  getByToken(token: string): Omit<PageShare, 'token'> & { token: string } | undefined {
    const row = this.db
      .prepare('SELECT page_id, role, created_at, created_by FROM shares WHERE token_hash = ?')
      .get(hashToken(token)) as { page_id: string; role: string; created_at: number; created_by: string } | undefined
    if (!row || !isRole(row.role) || row.role === 'owner') return undefined
    return { token, pageId: row.page_id, role: row.role, createdAt: row.created_at, createdBy: row.created_by }
  }

  list(pageId: string): PageShare[] {
    const rows = this.db
      .prepare('SELECT token_hash, page_id, role, created_at, created_by FROM shares WHERE page_id = ? ORDER BY created_at')
      .all(pageId) as Array<{ token_hash: string; page_id: string; role: string; created_at: number; created_by: string }>
    return rows
      .filter((row) => isShareRole(row.role))
      .map((row) => ({
        token: row.token_hash,
        pageId: row.page_id,
        role: row.role,
        createdAt: row.created_at,
        createdBy: row.created_by,
      }))
  }

  isShared(pageId: string) {
    const row = this.db.prepare('SELECT 1 FROM shares WHERE page_id = ? LIMIT 1').get(pageId)
    return Boolean(row)
  }

  revoke(token: string) {
    const info = this.db.prepare('DELETE FROM shares WHERE token_hash = ?').run(hashToken(token))
    return Number(info.changes ?? 0) > 0
  }

  canWrite(role: MemberRole) {
    return canEdit(role)
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
