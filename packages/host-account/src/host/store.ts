import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { currentAccountId } from '@biu/host-plugin-loader/data-dir'
import { AuthorizationService, type ResourcePolicyInput, type ResourceRole, type WorkspaceRole } from './authorization.ts'

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

export type Account = { id: string; name: string; email: string; createdAt: number }
export type Workspace = { id: string; name: string; ownerId: string; role: WorkspaceRole; createdAt: number }
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

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function inviteToken() {
  return randomBytes(24).toString('base64url')
}

function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPassword(password: string, stored: string) {
  const [kind, saltHex, hashHex] = stored.split(':')
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 32)
  const expected = Buffer.from(hashHex, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export class CollabStore {
  readonly authorization: AuthorizationService

  constructor(private db: DatabaseSync) {
    this.authorization = new AuthorizationService(db, (accountId) => this.accountActiveWorkspace(accountId))
  }

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

  register(name: string, now = Date.now(), password = '', email = ''): Account & { token: string } {
    const secret = password.trim()
    const normalized = email.trim().toLowerCase()
    if (secret && secret.length < 6) throw new CollabError('密码至少 6 位', 400)
    if (secret && !normalized) throw new CollabError('邮箱不能为空', 400)
    if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new CollabError('邮箱格式不对', 400)
    if (normalized) {
      const taken = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
      if (taken) throw new CollabError('这个邮箱已经注册过', 409)
    }
    const trimmed = name.trim() || normalized
    if (!trimmed) throw new CollabError('名字不能为空', 400)
    const account = {
      id: id('acc'),
      name: trimmed,
      email: normalized,
      token: randomBytes(24).toString('hex'),
      createdAt: now,
    }
    this.db
      .prepare('INSERT INTO accounts (id, name, token, password_hash, created_at, email) VALUES (?, ?, ?, ?, ?, ?)')
      .run(account.id, account.name, account.token, secret ? hashPassword(secret) : '', account.createdAt, normalized || null)
    return account
  }

  login(email: string, password: string): Account & { token: string } {
    const normalized = email.trim().toLowerCase()
    const row = this.db
      .prepare('SELECT id, name, email, token, password_hash, created_at FROM accounts WHERE email = ?')
      .get(normalized) as
      | { id: string; name: string; email: string; token: string; password_hash: string; created_at: number }
      | undefined
    if (!row?.password_hash || !verifyPassword(password, row.password_hash)) {
      throw new CollabError('邮箱或密码不对', 401)
    }
    return { id: row.id, name: row.name, email: row.email, token: row.token, createdAt: row.created_at }
  }

  /** 登录后停在自己的工作区。还没有的话建一个空的。 */
  enter(accountId: string) {
    const rows = this.listWorkspaces(accountId)
    const current = this.accountActiveWorkspace(accountId)
    const next = current && rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? this.createWorkspace(accountId, '我的工作区').id)
    this.rememberActive(accountId, next)
    return next
  }

  activeWorkspaceId() {
    const caller = currentAccountId()
    if (caller) return this.accountActiveWorkspace(caller)
    return this.stateValue('active')
  }

  accountByToken(token: string): Account | null {
    const row = this.db
      .prepare(
        `SELECT a.id, a.name, a.email, a.created_at,
                gs.id AS guest_session_id, gs.expires_at, gs.revoked_at
         FROM accounts a
         LEFT JOIN guest_sessions gs ON gs.account_id = a.id
         WHERE a.token = ?`,
      )
      .get(token) as
      | {
          id: string
          name: string
          email: string | null
          created_at: number
          guest_session_id?: string
          expires_at?: number
          revoked_at?: number | null
        }
      | undefined
    if (!row) return null
    if (row.guest_session_id) {
      const now = Date.now()
      if (row.revoked_at || Number(row.expires_at) <= now) return null
      this.db.prepare('UPDATE guest_sessions SET last_seen_at = ? WHERE id = ?').run(now, row.guest_session_id)
    }
    return { id: row.id, name: row.name, email: row.email ?? '', createdAt: row.created_at }
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
    this.requireManager(actorId, workspaceId)
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

  addMemberByEmail(actorId: string, workspaceId: string, email: string, now = Date.now()) {
    const normalized = email.trim().toLowerCase()
    if (!normalized) throw new CollabError('邮箱不能为空', 400)
    const row = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
    if (!row) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    return this.addMember(actorId, workspaceId, row.id, now)
  }

  createWorkspaceInvite(
    actorId: string,
    workspaceId: string,
    role: 'member' | 'viewer' = 'viewer',
    expiresInHours = 168,
    now = Date.now(),
  ) {
    this.requireManager(actorId, workspaceId)
    if (role !== 'member' && role !== 'viewer') throw new CollabError('邀请角色只能是编辑者或查看者', 400)
    const raw = inviteToken()
    const invite = {
      id: id('inv'),
      token: raw,
      workspaceId,
      kind: 'workspace' as const,
      role,
      expiresAt: now + Math.max(1, Math.min(24 * 30, expiresInHours)) * 60 * 60 * 1000,
    }
    this.db
      .prepare(
        `INSERT INTO workspace_invites
          (id, token_hash, workspace_id, kind, role, collection, record_id, resource_role,
           expires_at, max_uses, use_count, created_by, created_at)
         VALUES (?, ?, ?, 'workspace', ?, '', '', 'viewer', ?, 1, 0, ?, ?)`,
      )
      .run(invite.id, tokenHash(raw), workspaceId, role, invite.expiresAt, actorId, now)
    return invite
  }

  acceptWorkspaceInvite(actorId: string, token: string, now = Date.now()) {
    this.requireAccount(actorId)
    const guest = this.db.prepare('SELECT 1 AS ok FROM guest_sessions WHERE account_id = ?').get(actorId)
    if (guest) throw new CollabError('临时访客不能加入其他空间', 403)
    const invite = this.validInvite(token, 'workspace', now)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare(
          `INSERT INTO workspace_members (workspace_id, account_id, role, member_kind, created_at)
           VALUES (?, ?, ?, 'member', ?)
           ON CONFLICT(workspace_id, account_id) DO UPDATE SET
             role = CASE WHEN workspace_members.member_kind = 'external' THEN excluded.role ELSE workspace_members.role END,
             member_kind = CASE WHEN workspace_members.member_kind = 'external' THEN 'member' ELSE workspace_members.member_kind END`,
        )
        .run(invite.workspace_id, actorId, invite.role, now)
      this.useInvite(invite.id)
      this.rememberActive(actorId, invite.workspace_id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return { workspaceId: invite.workspace_id, role: invite.role }
  }

  createGuestInvite(
    actorId: string,
    collection: string,
    recordId: string,
    resourceRole: 'viewer' | 'editor' = 'viewer',
    expiresInHours = 24,
    now = Date.now(),
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const resource = { type: 'record' as const, workspaceId, ...this.recordKey(collection, recordId) }
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:manage-permissions',
      resource,
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    const raw = inviteToken()
    const invite = {
      id: id('inv'),
      token: raw,
      workspaceId,
      kind: 'guest' as const,
      collection: resource.collection,
      recordId: resource.recordId,
      role: resourceRole,
      expiresAt: now + Math.max(1, Math.min(24 * 30, expiresInHours)) * 60 * 60 * 1000,
    }
    this.db
      .prepare(
        `INSERT INTO workspace_invites
          (id, token_hash, workspace_id, kind, role, collection, record_id, resource_role,
           expires_at, max_uses, use_count, created_by, created_at)
         VALUES (?, ?, ?, 'guest', 'viewer', ?, ?, ?, ?, 1, 0, ?, ?)`,
      )
      .run(
        invite.id,
        tokenHash(raw),
        workspaceId,
        resource.collection,
        resource.recordId,
        resourceRole,
        invite.expiresAt,
        actorId,
        now,
      )
    return invite
  }

  acceptGuestInvite(token: string, displayName = '', now = Date.now()) {
    const invite = this.validInvite(token, 'guest', now)
    const accountId = id('guest')
    const sessionId = id('gss')
    const accountToken = randomBytes(24).toString('hex')
    const name = displayName.trim().slice(0, 40) || `临时访客-${accountId.slice(-4)}`
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare(
          `INSERT INTO accounts (id, name, token, password_hash, created_at, email, active_workspace_id)
           VALUES (?, ?, ?, '', ?, NULL, ?)`,
        )
        .run(accountId, name, accountToken, now, invite.workspace_id)
      this.db
        .prepare(
          `INSERT INTO workspace_members
            (workspace_id, account_id, role, member_kind, created_at, display_name)
           VALUES (?, ?, 'viewer', 'guest', ?, ?)`,
        )
        .run(invite.workspace_id, accountId, now, name)
      this.db
        .prepare(
          `INSERT INTO guest_sessions
            (id, account_id, workspace_id, expires_at, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(sessionId, accountId, invite.workspace_id, invite.expires_at, now, now)
      this.db
        .prepare(
          `INSERT INTO record_grants
            (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
           VALUES (?, ?, ?, 'account', ?, ?, ?, ?)`,
        )
        .run(
          invite.workspace_id,
          invite.collection,
          invite.record_id,
          accountId,
          invite.resource_role,
          invite.created_by,
          now,
        )
      this.useInvite(invite.id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return {
      id: accountId,
      name,
      email: '',
      token: accountToken,
      workspaceId: invite.workspace_id,
      expiresAt: invite.expires_at,
      collection: invite.collection,
      recordId: invite.record_id,
    }
  }

  members(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId)
    return this.db
      .prepare(
        `SELECT a.id,
                COALESCE(NULLIF(a.name, ''), NULLIF(a.email, ''), '未设置') AS name,
                COALESCE(m.display_name, '') AS display_name,
                COALESCE(a.email, '') AS email, m.role, m.member_kind, m.created_at
         FROM workspace_members m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.workspace_id = ?
         ORDER BY m.created_at`,
      )
      .all(workspaceId) as Array<{
        id: string
        name: string
        display_name: string
        email: string
        role: string
        member_kind: 'member' | 'external' | 'guest'
        created_at: number
      }>
  }

  currentMembers() {
    const actorId = currentAccountId()
    const workspaceId = this.activeWorkspaceId()
    if (!actorId || !workspaceId) return []
    return this.members(actorId, workspaceId)
  }

  removeMember(actorId: string, workspaceId: string, accountId: string) {
    const actorRole = this.requireManager(actorId, workspaceId)
    const target = this.db
      .prepare('SELECT role, member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string; member_kind: string } | undefined
    if (!target) throw new CollabError('成员不存在', 404)
    if (target.role === 'owner') throw new CollabError('不能移除工作区所有者', 400)
    if (actorRole === 'admin' && target.role === 'admin') throw new CollabError('管理员不能移除其他管理员', 403)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(
        `DELETE FROM workspace_group_members
         WHERE account_id = ? AND group_id IN (SELECT id FROM workspace_groups WHERE workspace_id = ?)`,
      ).run(accountId, workspaceId)
      this.db.prepare(
        `DELETE FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?`,
      ).run(workspaceId, accountId)
      this.db
        .prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
        .run(workspaceId, accountId)
      if (target.member_kind === 'guest') {
        this.db.prepare('DELETE FROM guest_sessions WHERE account_id = ?').run(accountId)
        this.db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return { id: accountId }
  }

  updateMemberRole(actorId: string, workspaceId: string, accountId: string, role: WorkspaceRole) {
    this.requireRole(actorId, workspaceId, 'owner')
    const target = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string } | undefined
    if (!target) throw new CollabError('成员不存在', 404)
    if (target.role === 'owner' && role !== 'owner') throw new CollabError('请先把所有者角色转交给其他成员', 400)
    if (role === 'owner' && accountId !== actorId) {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db
          .prepare(`UPDATE workspace_members SET role = 'admin' WHERE workspace_id = ? AND account_id = ?`)
          .run(workspaceId, actorId)
        this.db
          .prepare(`UPDATE workspace_members SET role = 'owner' WHERE workspace_id = ? AND account_id = ?`)
          .run(workspaceId, accountId)
        this.db.prepare('UPDATE workspaces SET owner_id = ? WHERE id = ?').run(accountId, workspaceId)
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
      return this.members(accountId, workspaceId).find((row) => row.id === accountId)!
    }
    this.db
      .prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND account_id = ?')
      .run(role, workspaceId, accountId)
    return this.members(actorId, workspaceId).find((row) => row.id === accountId)!
  }

  createGroup(actorId: string, workspaceId: string, name: string, now = Date.now()) {
    this.requireManager(actorId, workspaceId)
    const trimmed = name.trim()
    if (!trimmed) throw new CollabError('组名不能为空', 400)
    const group = { id: id('grp'), workspaceId, name: trimmed, createdBy: actorId, createdAt: now }
    this.db
      .prepare('INSERT INTO workspace_groups (id, workspace_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(group.id, workspaceId, group.name, actorId, now)
    return group
  }

  groups(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT g.id, g.name, g.created_by, g.created_at, COUNT(gm.account_id) AS member_count
         FROM workspace_groups g
         LEFT JOIN workspace_group_members gm ON gm.group_id = g.id
         WHERE g.workspace_id = ?
         GROUP BY g.id
         ORDER BY g.created_at`,
      )
      .all(workspaceId) as Array<{
        id: string
        name: string
        created_by: string
        created_at: number
        member_count: number
      }>
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
      memberCount: Number(row.member_count),
    }))
  }

  addGroupMemberByEmail(actorId: string, workspaceId: string, groupId: string, email: string, now = Date.now()) {
    this.requireManager(actorId, workspaceId)
    const group = this.db
      .prepare('SELECT id FROM workspace_groups WHERE id = ? AND workspace_id = ?')
      .get(groupId, workspaceId) as { id: string } | undefined
    if (!group) throw new CollabError('成员组不存在', 404)
    const account = this.db
      .prepare('SELECT id FROM accounts WHERE email = ?')
      .get(email.trim().toLowerCase()) as { id: string } | undefined
    if (!account) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    this.requireMember(account.id, workspaceId)
    this.db
      .prepare(
        `INSERT INTO workspace_group_members (group_id, account_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(group_id, account_id) DO NOTHING`,
      )
      .run(groupId, account.id, now)
    return this.groupMembers(actorId, workspaceId, groupId)
  }

  groupMembers(actorId: string, workspaceId: string, groupId: string) {
    this.requireMember(actorId, workspaceId)
    return this.db
      .prepare(
        `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), '未设置') AS name, COALESCE(a.email, '') AS email
         FROM workspace_group_members gm
         JOIN workspace_groups g ON g.id = gm.group_id AND g.workspace_id = ?
         JOIN accounts a ON a.id = gm.account_id
         LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = a.id
         WHERE gm.group_id = ?
         ORDER BY gm.created_at`,
      )
      .all(workspaceId, groupId)
  }

  grantGroup(
    actorId: string,
    collection: string,
    recordId: string,
    groupId: string,
    role: ResourceRole,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const group = this.db
      .prepare('SELECT id FROM workspace_groups WHERE id = ? AND workspace_id = ?')
      .get(groupId, workspaceId) as { id: string } | undefined
    if (!group) throw new CollabError('成员组不存在', 404)
    this.authorization.grant(
      actorId,
      { type: 'record', workspaceId, collection, recordId },
      'group',
      groupId,
      role,
    )
    return this.accessRows(workspaceId, collection, recordId)
  }

  grantMemberView(
    actorId: string,
    collection: string,
    recordId: string,
    viewId: string,
    role: ResourceRole,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const normalized = viewId.trim()
    if (!normalized) throw new CollabError('成员视图不能为空', 400)
    this.authorization.grant(
      actorId,
      { type: 'record', workspaceId, collection, recordId },
      'member_view',
      normalized,
      role,
    )
    return this.accessRows(workspaceId, collection, recordId)
  }

  workspaceProfile(actorId: string) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const row = this.db
      .prepare(
        `SELECT a.email AS login_email, m.display_name, m.avatar
         FROM workspace_members m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.workspace_id = ? AND m.account_id = ?`,
      )
      .get(workspaceId, actorId) as { login_email: string | null; display_name: string; avatar: string } | undefined
    if (!row) throw new CollabError('不在这个工作区', 403)
    return { workspaceId, email: row.login_email ?? '', name: row.display_name.trim(), avatar: row.avatar }
  }

  saveWorkspaceProfile(actorId: string, patch: { name?: string; avatar?: string }) {
    const current = this.workspaceProfile(actorId)
    const name = patch.name !== undefined ? patch.name.trim().slice(0, 40) : current.name
    let avatar = patch.avatar !== undefined ? patch.avatar.trim() : current.avatar
    if (avatar && !avatar.startsWith('data:image/')) avatar = ''
    if (avatar.length > 240_000) throw new CollabError('头像太大', 400)
    const display = name
    this.db
      .prepare(
        `UPDATE workspace_members SET display_name = ?, avatar = ? WHERE workspace_id = ? AND account_id = ?`,
      )
      .run(display, avatar, current.workspaceId, actorId)
    return { ...current, name: display, avatar }
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
    const decision = this.authorization.authorize(
      { type: 'account', accountId: input.actorId, workspaceId: input.workspaceId },
      'resource:update',
      { type: 'record', workspaceId: input.workspaceId, collection: key.collection, recordId: key.recordId },
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
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
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:update',
      { type: 'record', workspaceId, collection: key.collection, recordId: key.recordId },
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
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
        `SELECT p.workspace_id, p.account_id, COALESCE(NULLIF(m.display_name, ''), '未设置') AS name, p.collection, p.record_id, p.seen_at
         FROM presence p
         JOIN accounts a ON a.id = p.account_id
         LEFT JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.account_id = p.account_id
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
    return { active, home, mine, any, strict: Boolean(currentAccountId()) }
  }

  private stateValue(key: string) {
    const row = this.db.prepare('SELECT value FROM collab_state WHERE key = ?').get(key) as { value?: string } | undefined
    return row?.value || null
  }

  setActive(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId)
    this.rememberActive(actorId, workspaceId)
    return workspaceId
  }

  private accountActiveWorkspace(accountId: string) {
    const row = this.db.prepare('SELECT active_workspace_id FROM accounts WHERE id = ?').get(accountId) as
      | { active_workspace_id?: string }
      | undefined
    return row?.active_workspace_id || null
  }

  private rememberActive(accountId: string, workspaceId: string) {
    this.db.prepare('UPDATE accounts SET active_workspace_id = ? WHERE id = ?').run(workspaceId, accountId)
    const caller = currentAccountId()
    if (!caller || caller === accountId) this.writeState('active', workspaceId)
  }

  recordIds(workspaceId: string, collection: string) {
    const rows = this.db
      .prepare('SELECT record_id FROM record_owners WHERE workspace_id = ? AND collection = ?')
      .all(workspaceId, collection) as Array<{ record_id: string }>
    return new Set(rows.map((row) => row.record_id))
  }

  attach(
    workspaceId: string,
    collection: string,
    recordId: string,
    now = Date.now(),
    policy: ResourcePolicyInput = {},
  ) {
    const owner = this.db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId) as
      | { owner_id: string }
      | undefined
    if (!owner) throw new CollabError('工作区不存在', 404)
    const caller = currentAccountId()
    const recordOwner = caller || owner.owner_id
    this.db
      .prepare(
        `INSERT INTO record_owners (workspace_id, collection, record_id, owner_id, version, updated_at)
         VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT(workspace_id, collection, record_id) DO NOTHING`,
      )
      .run(workspaceId, collection, recordId, recordOwner, now)
    if (caller) {
      this.authorization.attach(
        { type: 'account', accountId: caller, workspaceId },
        { type: 'record', workspaceId, collection, recordId },
        policy,
        now,
      )
    }
  }

  grantMap(workspaceId: string, collection: string) {
    const rows = this.db
      .prepare(
        `SELECT record_id, subject_id
         FROM record_grants
         WHERE workspace_id = ? AND collection = ? AND subject_type = 'account'`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; subject_id: string }>
    const map = new Map<string, Set<string>>()
    for (const row of rows) {
      const set = map.get(row.record_id) ?? new Set<string>()
      set.add(row.subject_id)
      map.set(row.record_id, set)
    }
    return map
  }

  canReadRecord(collection: string, recordId: string) {
    const caller = currentAccountId()
    const workspaceId = this.activeWorkspaceId()
    if (!caller || !workspaceId) return true
    return this.authorization.authorize(
      { type: 'account', accountId: caller, workspaceId },
      'resource:read',
      { type: 'record', workspaceId, collection, recordId },
    ).allowed
  }

  recordAccess(actorId: string, collection: string, recordId: string) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    if (!this.canReadRecord(collection, recordId)) throw new CollabError('没有权限', 403)
    return this.accessRows(workspaceId, collection, recordId)
  }

  shareWithEmail(
    actorId: string,
    collection: string,
    recordId: string,
    email: string,
    role: ResourceRole = 'editor',
    now = Date.now(),
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const owned = this.db
      .prepare('SELECT 1 AS ok FROM record_owners WHERE workspace_id = ? AND collection = ? AND record_id = ?')
      .get(workspaceId, collection, recordId) as { ok: number } | undefined
    if (!owned) throw new CollabError('记录不在这个工作区', 404)
    const normalized = email.trim().toLowerCase()
    if (!normalized) throw new CollabError('邮箱不能为空', 400)
    const account = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
    if (!account) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    this.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, account_id, role, member_kind, created_at)
         VALUES (?, ?, 'member', 'external', ?)
         ON CONFLICT(workspace_id, account_id) DO NOTHING`,
      )
      .run(workspaceId, account.id, now)
    const resource = { type: 'record' as const, workspaceId, collection, recordId }
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:share',
      resource,
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    this.authorization.grant(actorId, resource, 'account', account.id, role, now)
    return this.accessRows(workspaceId, collection, recordId)
  }

  private accessRows(workspaceId: string, collection: string, recordId: string) {
    const rows = this.db
      .prepare(
        `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), '未设置') AS name, COALESCE(a.email, '') AS email, g.role
         FROM record_grants g
         JOIN accounts a ON g.subject_type = 'account' AND a.id = g.subject_id
         LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ? AND g.subject_type = 'account'
         ORDER BY g.created_at`,
      )
      .all(workspaceId, collection, recordId) as Array<{ id: string; name: string; email: string; role: string }>
    const groups = this.db
      .prepare(
        `SELECT g.id, g.name, rg.role
         FROM record_grants rg
         JOIN workspace_groups g ON rg.subject_type = 'group' AND g.id = rg.subject_id
         WHERE rg.workspace_id = ? AND rg.collection = ? AND rg.record_id = ?
         ORDER BY rg.created_at`,
      )
      .all(workspaceId, collection, recordId) as Array<{ id: string; name: string; role: string }>
    const memberViews = this.db
      .prepare(
        `SELECT subject_id AS id, role
         FROM record_grants
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'member_view'
         ORDER BY created_at`,
      )
      .all(workspaceId, collection, recordId) as Array<{ id: string; role: string }>
    return { private: rows.length + groups.length + memberViews.length > 0, people: rows, groups, memberViews }
  }

  private writeState(key: string, value: string) {
    this.db
      .prepare(`INSERT INTO collab_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, value)
  }

  private validInvite(token: string, kind: 'workspace' | 'guest', now: number) {
    const normalized = token.trim()
    if (!normalized) throw new CollabError('邀请链接无效', 400)
    const row = this.db
      .prepare(
        `SELECT id, workspace_id, kind, role, collection, record_id, resource_role,
                expires_at, max_uses, use_count, created_by, revoked_at
         FROM workspace_invites
         WHERE token_hash = ? AND kind = ?`,
      )
      .get(tokenHash(normalized), kind) as
      | {
          id: string
          workspace_id: string
          kind: string
          role: WorkspaceRole
          collection: string
          record_id: string
          resource_role: ResourceRole
          expires_at: number
          max_uses: number
          use_count: number
          created_by: string
          revoked_at: number | null
        }
      | undefined
    if (!row) throw new CollabError('邀请链接无效', 404)
    if (row.revoked_at || row.expires_at <= now || row.use_count >= row.max_uses) {
      throw new CollabError('邀请链接已过期或已使用', 410)
    }
    return row
  }

  private useInvite(inviteId: string) {
    const result = this.db
      .prepare('UPDATE workspace_invites SET use_count = use_count + 1 WHERE id = ? AND use_count < max_uses')
      .run(inviteId)
    if (!result.changes) throw new CollabError('邀请链接已使用', 410)
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
      account: { id: row.id, name: row.name, email: '', createdAt: row.created_at },
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

  private requireManager(accountId: string, workspaceId: string) {
    const actual = this.requireMember(accountId, workspaceId)
    if (actual !== 'owner' && actual !== 'admin') throw new CollabError('只有所有者或管理员可以这样做', 403)
    return actual
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
