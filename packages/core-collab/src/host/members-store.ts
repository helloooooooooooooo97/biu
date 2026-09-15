import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import { hashPassword, isRole, isGuestId, newId, verifyPassword, type Member, type MemberRole } from './session.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type Invite = {
  token: string
  role: MemberRole
  createdAt: number
}

export const DEFAULT_ADMIN_NAME = 'root'
export const DEFAULT_ADMIN_PASSWORD = '123456'

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
    const cols = this.db.prepare('PRAGMA table_info(members)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'password_hash')) {
      this.db.exec('ALTER TABLE members ADD COLUMN password_hash TEXT NOT NULL DEFAULT ""')
    }
  }

  private passwordOf(id: string) {
    const row = this.db.prepare('SELECT password_hash FROM members WHERE id = ?').get(id) as { password_hash?: string } | undefined
    return String(row?.password_hash ?? '')
  }

  findByName(name: string) {
    const want = String(name ?? '').trim()
    if (!want) return undefined
    return this.list().find((row) => row.name === want)
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

  ensureDefaultAdmin(): Member {
    const password = hashPassword(DEFAULT_ADMIN_PASSWORD)
    const existing = this.findByName(DEFAULT_ADMIN_NAME)
    if (existing) {
      this.db.prepare('UPDATE members SET role = ?, password_hash = ? WHERE id = ?').run('owner', password, existing.id)
      return this.get(existing.id)!
    }
    const member: Member = { id: newId('m'), name: DEFAULT_ADMIN_NAME, role: 'owner', createdAt: Date.now() }
    this.db
      .prepare('INSERT INTO members (id, name, role, created_at, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(member.id, member.name, member.role, member.createdAt, password)
    return member
  }

  bootstrap(name: string, password = ''): Member {
    if (this.list().length) throw new Error('workspace already has members')
    const member: Member = { id: newId('m'), name: name.trim() || '用户', role: 'owner', createdAt: Date.now() }
    this.db
      .prepare('INSERT INTO members (id, name, role, created_at, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(member.id, member.name, member.role, member.createdAt, password ? hashPassword(password) : '')
    return member
  }

  createInvite(role: MemberRole): Invite {
    if (role === 'owner') throw new Error('cannot invite another owner')
    const token = randomBytes(18).toString('base64url')
    const createdAt = Date.now()
    this.db.prepare('INSERT INTO invites (token_hash, role, created_at) VALUES (?, ?, ?)').run(hashToken(token), role, createdAt)
    return { token, role, createdAt }
  }

  join(token: string, name: string, password = ''): Member {
    const row = this.db.prepare('SELECT role FROM invites WHERE token_hash = ?').get(hashToken(token)) as { role: string } | undefined
    if (!row || !isRole(row.role) || row.role === 'owner') throw new Error('invalid invite')
    const member = this.add(name, row.role, password)
    this.db.prepare('DELETE FROM invites WHERE token_hash = ?').run(hashToken(token))
    return member
  }

  ensureGuest(id: string): Member {
    if (!isGuestId(id)) throw new Error('invalid guest id')
    const existing = this.get(id)
    if (existing) return existing
    const member: Member = {
      id,
      name: id,
      role: this.list().length === 0 ? 'owner' : 'editor',
      createdAt: Date.now(),
    }
    this.db
      .prepare('INSERT INTO members (id, name, role, created_at, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(member.id, member.name, member.role, member.createdAt, '')
    return member
  }

  add(name: string, role: MemberRole, password = ''): Member {
    const title = String(name ?? '').trim() || '同事'
    if (this.findByName(title)) throw new Error('name taken')
    if (role === 'owner' && this.list().some((item) => item.role === 'owner')) throw new Error('owner already exists')
    const member: Member = {
      id: newId('m'),
      name: title,
      role: this.list().length === 0 ? 'owner' : role === 'owner' ? 'editor' : role,
      createdAt: Date.now(),
    }
    this.db
      .prepare('INSERT INTO members (id, name, role, created_at, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(member.id, member.name, member.role, member.createdAt, password ? hashPassword(password) : '')
    return member
  }

  register(name: string, password: string): Member {
    const title = String(name ?? '').trim()
    const pass = String(password ?? '')
    if (!title || !pass) throw new Error('name and password required')
    if (this.findByName(title)) throw new Error('name taken')
    const named = this.list().filter((row) => !isGuestId(row.id) && this.passwordOf(row.id))
    if (!named.length) {
      if (!this.list().length) return this.bootstrap(title, pass)
      const member: Member = { id: newId('m'), name: title, role: 'owner', createdAt: Date.now() }
      this.db
        .prepare('INSERT INTO members (id, name, role, created_at, password_hash) VALUES (?, ?, ?, ?, ?)')
        .run(member.id, member.name, member.role, member.createdAt, hashPassword(pass))
      return member
    }
    return this.add(title, 'editor', pass)
  }

  login(name: string, password: string) {
    const member = this.findByName(String(name ?? '').trim())
    if (!member) throw new Error('unknown member')
    if (!verifyPassword(password, this.passwordOf(member.id))) throw new Error('bad password')
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
