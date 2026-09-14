import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import { isRole, newId, type Member, type MemberRole } from './session.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type Invite = {
  token: string
  role: MemberRole
  createdAt: number
}

export class MembersStore {
  private db: DatabaseSync

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true })
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    this.db = new DatabaseSync(file)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invites (
        token_hash TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `)
  }

  list(): Member[] {
    const rows = this.db.prepare('SELECT id, name, role, created_at FROM members ORDER BY created_at').all() as Array<{
      id: string
      name: string
      role: string
      created_at: number
    }>
    return rows.map((row) => ({ id: row.id, name: row.name, role: row.role as MemberRole, createdAt: row.created_at }))
  }

  get(id: string) {
    const row = this.db.prepare('SELECT id, name, role, created_at FROM members WHERE id = ?').get(id) as
      | { id: string; name: string; role: string; created_at: number }
      | undefined
    if (!row || !isRole(row.role)) return undefined
    return { id: row.id, name: row.name, role: row.role, createdAt: row.created_at }
  }

  bootstrap(name: string): Member {
    if (this.list().length) throw new Error('workspace already has members')
    const member: Member = { id: newId('m'), name: name.trim() || '用户', role: 'owner', createdAt: Date.now() }
    this.db.prepare('INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)').run(member.id, member.name, member.role, member.createdAt)
    return member
  }

  createInvite(role: MemberRole): Invite {
    if (role === 'owner') throw new Error('cannot invite another owner')
    const token = randomBytes(18).toString('base64url')
    const createdAt = Date.now()
    this.db.prepare('INSERT INTO invites (token_hash, role, created_at) VALUES (?, ?, ?)').run(hashToken(token), role, createdAt)
    return { token, role, createdAt }
  }

  join(token: string, name: string): Member {
    const row = this.db.prepare('SELECT role FROM invites WHERE token_hash = ?').get(hashToken(token)) as { role: string } | undefined
    if (!row || !isRole(row.role) || row.role === 'owner') throw new Error('invalid invite')
    const member = this.add(name, row.role)
    this.db.prepare('DELETE FROM invites WHERE token_hash = ?').run(hashToken(token))
    return member
  }

  add(name: string, role: MemberRole): Member {
    if (role === 'owner' && this.list().some((item) => item.role === 'owner')) throw new Error('owner already exists')
    const member: Member = {
      id: newId('m'),
      name: String(name ?? '').trim() || '同事',
      role: this.list().length === 0 ? 'owner' : role === 'owner' ? 'editor' : role,
      createdAt: Date.now(),
    }
    this.db.prepare('INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)').run(member.id, member.name, member.role, member.createdAt)
    return member
  }

  update(id: string, patch: { name?: string; role?: MemberRole }) {
    const current = this.get(id)
    if (!current) throw new Error('member not found')
    const name = patch.name != null ? String(patch.name).trim() || current.name : current.name
    let role = patch.role ?? current.role
    if (current.role === 'owner' && role !== 'owner') {
      const owners = this.list().filter((item) => item.role === 'owner')
      if (owners.length < 2) throw new Error('at least one owner is required')
    }
    if (role === 'owner' && current.role !== 'owner') role = 'editor'
    this.db.prepare('UPDATE members SET name = ?, role = ? WHERE id = ?').run(name, role, id)
    return this.get(id)!
  }

  remove(id: string) {
    const current = this.get(id)
    if (!current) return false
    if (current.role === 'owner') {
      const owners = this.list().filter((item) => item.role === 'owner')
      if (owners.length < 2) throw new Error('at least one owner is required')
    }
    this.db.prepare('DELETE FROM members WHERE id = ?').run(id)
    return true
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
