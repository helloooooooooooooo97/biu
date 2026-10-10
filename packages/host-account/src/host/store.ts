import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { currentAccountId, currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'
import { AuthorizationService, type ResourcePolicyInput, type ResourceRole, type WorkspaceRole } from './authorization.ts'

export const PRESENCE_STALE_MS = 30_000
export const DEFAULT_LOCK_MS = 60_000
export const DEFAULT_SESSION_MS = 30 * 24 * 60 * 60 * 1000
export const DEFAULT_MCP_CREDENTIAL_MS = 90 * 24 * 60 * 60 * 1000

const builtinPluginLookups = new Set<(pluginId: string) => boolean>()

/** 内置插件由插件商店登记。成员不需要再在设置里授权。 */
export function registerBuiltinPluginLookup(lookup: (pluginId: string) => boolean) {
  builtinPluginLookups.add(lookup)
  return () => {
    builtinPluginLookups.delete(lookup)
  }
}

export function isRegisteredBuiltinPlugin(pluginId: string) {
  for (const lookup of builtinPluginLookups) {
    if (lookup(pluginId)) return true
  }
  return false
}

export type PluginAssignmentSubject =
  | { type: 'account'; id: string }
  | { type: 'member_view'; id: string }

export type PluginPackageInput = {
  id: string
  version: string
  packageHash: string
  packagePath: string
  sourceKind: string
  trustState: string
  tenantMode: string
  hasWeb: boolean
  hasHost: boolean
  manifest: unknown
}

export class CollabError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CollabError'
  }
}

export type Account = {
  id: string
  name: string
  email: string
  createdAt: number
  mustChangePassword?: boolean
}
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
    this.ensureBuiltInRoot()
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

  login(email: string, password: string, deviceName = '浏览器'): Account & { token: string } {
    const normalized = email.trim().toLowerCase()
    const row = this.db
      .prepare('SELECT id, name, email, token, password_hash, created_at, must_change_password FROM accounts WHERE email = ?')
      .get(normalized) as
      | {
          id: string
          name: string
          email: string
          token: string
          password_hash: string
          created_at: number
          must_change_password: number
        }
      | undefined
    if (!row?.password_hash || !verifyPassword(password, row.password_hash)) {
      throw new CollabError('邮箱或密码不对', 401)
    }
    const session = this.openSession(row.id, deviceName.slice(0, 120))
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      token: session.token,
      createdAt: row.created_at,
      mustChangePassword: Boolean(row.must_change_password),
    }
  }

  changePassword(accountId: string, currentPassword: string, nextPassword: string, keepToken = '', now = Date.now()) {
    const next = nextPassword.trim()
    if (next.length < 6) throw new CollabError('密码至少 6 位', 400)
    const row = this.db.prepare('SELECT password_hash FROM accounts WHERE id = ?').get(accountId) as { password_hash: string } | undefined
    if (!row?.password_hash || !verifyPassword(currentPassword, row.password_hash)) throw new CollabError('当前密码不对', 401)
    this.db
      .prepare('UPDATE accounts SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(hashPassword(next), accountId)
    const keepHash = keepToken ? this.digestToken(keepToken) : ''
    this.db
      .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL AND token_hash != ?')
      .run(now, accountId, keepHash)
    return { ok: true }
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
    const requested = currentRequestWorkspaceId()
    const caller = currentAccountId()
    if (requested) {
      if (caller && !this.isMember(caller, requested)) return null
      return requested
    }
    if (process.env.BIU_ONLINE === '1') return caller ? this.accountActiveWorkspace(caller) : null
    if (caller) return this.accountActiveWorkspace(caller)
    return this.stateValue('active')
  }

  isMember(accountId: string, workspaceId: string) {
    const row = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role?: string } | undefined
    return Boolean(row)
  }

  private digestToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  openSession(accountId: string, deviceName = '', expiresAt: number | null = null, now = Date.now()) {
    const token = randomBytes(24).toString('hex')
    const sessionId = id('ses')
    const expiration = expiresAt ?? now + DEFAULT_SESSION_MS
    this.db
      .prepare(
        `INSERT INTO auth_sessions (id, account_id, token_hash, device_name, expires_at, revoked_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(sessionId, accountId, this.digestToken(token), deviceName, expiration, now, now)
    return { id: sessionId, token, expiresAt: expiration }
  }

  /** 本机登录集中部署后，用对方发的令牌在本地也能认出这个账号。 */
  bindKnownSession(accountId: string, token: string, deviceName = '本机', now = Date.now()) {
    const hash = this.digestToken(token)
    const existing = this.db.prepare('SELECT id FROM auth_sessions WHERE token_hash = ?').get(hash) as { id: string } | undefined
    if (existing) return
    this.db
      .prepare(
        `INSERT INTO auth_sessions (id, account_id, token_hash, device_name, expires_at, revoked_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(id('ses'), accountId, hash, deviceName, now + DEFAULT_SESSION_MS, now, now)
  }

  ensureRemoteAccount(input: { id: string; name: string; email: string; token: string; workspaceId: string; workspaceName?: string }) {
    const email = input.email.trim().toLowerCase()
    const byId = this.db.prepare('SELECT id FROM accounts WHERE id = ?').get(input.id) as { id: string } | undefined
    const byEmail = email
      ? (this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(email) as { id: string } | undefined)
      : undefined
    const accountId = byId?.id ?? byEmail?.id ?? input.id
    if (!byId && !byEmail) {
      this.db
        .prepare('INSERT INTO accounts (id, name, token, password_hash, created_at, email) VALUES (?, ?, ?, ?, ?, ?)')
        .run(accountId, input.name || email || '我', input.token, '', Date.now(), email || null)
    }
    this.bindKnownSession(accountId, input.token)
    if (input.workspaceId) {
      const workspace = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(input.workspaceId) as { id: string } | undefined
      if (!workspace) {
        this.db
          .prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
          .run(input.workspaceId, input.workspaceName || '在线', accountId, Date.now())
      }
      const member = this.db
        .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
        .get(input.workspaceId, accountId)
      if (!member) {
        this.db
          .prepare('INSERT INTO workspace_members (workspace_id, account_id, role, created_at) VALUES (?, ?, ?, ?)')
          .run(input.workspaceId, accountId, 'owner', Date.now())
      }
      this.rememberActive(accountId, input.workspaceId)
    }
    return { id: accountId, token: input.token, workspaceId: input.workspaceId }
  }

  revokeSession(token: string, now = Date.now()) {
    if (!token) return
    this.db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now, this.digestToken(token))
  }

  listSessions(accountId: string) {
    return this.db
      .prepare(
        `SELECT id, device_name, expires_at, revoked_at, created_at, last_seen_at
         FROM auth_sessions WHERE account_id = ? ORDER BY created_at DESC`,
      )
      .all(accountId) as Array<{
      id: string
      device_name: string
      expires_at: number | null
      revoked_at: number | null
      created_at: number
      last_seen_at: number
    }>
  }

  revokeSessionById(actorId: string, sessionId: string, now = Date.now()) {
    const row = this.db.prepare('SELECT account_id FROM auth_sessions WHERE id = ?').get(sessionId) as { account_id: string } | undefined
    if (!row || row.account_id !== actorId) throw new CollabError('会话不存在', 404)
    this.db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, sessionId)
    return { id: sessionId }
  }

  issueMcpCredential(
    accountId: string,
    workspaceId: string,
    options: { allowedTools?: string[]; expiresAt?: number } = {},
    now = Date.now(),
  ) {
    if (!this.isMember(accountId, workspaceId)) throw new CollabError('不在这个空间', 403)
    const token = randomBytes(24).toString('hex')
    const credentialId = id('mcp')
    const allowedTools = [...new Set(options.allowedTools?.map(String).filter(Boolean) ?? [])]
    const expiresAt = options.expiresAt ?? now + DEFAULT_MCP_CREDENTIAL_MS
    if (expiresAt <= now) throw new CollabError('凭证有效期必须晚于当前时间', 400)
    this.db
      .prepare(
        `INSERT INTO mcp_credentials (id, token_hash, account_id, workspace_id, allowed_tools, expires_at, revoked_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(credentialId, this.digestToken(token), accountId, workspaceId, JSON.stringify(allowedTools), expiresAt, now)
    return { id: credentialId, token, workspaceId, allowedTools, expiresAt }
  }

  listMcpCredentials(accountId: string, workspaceId: string) {
    if (!this.isMember(accountId, workspaceId)) throw new CollabError('不在这个空间', 403)
    return this.db
      .prepare(
        `SELECT id, workspace_id, allowed_tools, expires_at, revoked_at, created_at
         FROM mcp_credentials WHERE account_id = ? AND workspace_id = ? ORDER BY created_at DESC`,
      )
      .all(accountId, workspaceId)
      .map((row) => {
        const value = row as Record<string, unknown>
        return { ...value, allowed_tools: JSON.parse(String(value.allowed_tools || '[]')) }
      })
  }

  revokeMcpCredential(accountId: string, credentialId: string, now = Date.now()) {
    const result = this.db
      .prepare('UPDATE mcp_credentials SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL')
      .run(now, credentialId, accountId)
    if (!result.changes) throw new CollabError('MCP 凭证不存在', 404)
    return { id: credentialId }
  }

  resolveMcpCredential(token: string, now = Date.now()) {
    if (!token) return null
    const row = this.db
      .prepare(
        `SELECT c.id, c.account_id, c.workspace_id, c.allowed_tools, c.expires_at, c.revoked_at, m.role
         FROM mcp_credentials c
         LEFT JOIN workspace_members m ON m.workspace_id = c.workspace_id AND m.account_id = c.account_id
         WHERE c.token_hash = ?`,
      )
      .get(this.digestToken(token)) as
      | { id: string; account_id: string; workspace_id: string; allowed_tools: string; expires_at: number | null; revoked_at: number | null; role: string | null }
      | undefined
    if (!row || row.revoked_at || (row.expires_at && row.expires_at <= now) || !row.role) return null
    return {
      credentialId: row.id,
      accountId: row.account_id,
      workspaceId: row.workspace_id,
      role: row.role,
      allowedTools: JSON.parse(row.allowed_tools || '[]') as string[],
    }
  }

  auditMcp(tenant: { credentialId: string; accountId: string; workspaceId: string }, toolName: string, success: boolean, now = Date.now()) {
    this.db
      .prepare(
        `INSERT INTO mcp_audit_log
         (credential_id, account_id, workspace_id, tool_name, success, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(tenant.credentialId, tenant.accountId, tenant.workspaceId, toolName, success ? 1 : 0, now)
  }

  listMcpAudit(accountId: string, workspaceId: string, limit = 100) {
    this.requireManager(accountId, workspaceId)
    return this.db
      .prepare(
        `SELECT id, credential_id, account_id, workspace_id, tool_name, success, created_at
         FROM mcp_audit_log WHERE workspace_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(workspaceId, Math.max(1, Math.min(500, limit)))
  }

  tenantForRecord(collection: string, recordId: string) {
    const row = this.db
      .prepare(
        `SELECT workspace_id, owner_id FROM record_owners
         WHERE collection = ? AND record_id = ? LIMIT 1`,
      )
      .get(collection, recordId) as { workspace_id: string; owner_id: string } | undefined
    return row ? { workspaceId: row.workspace_id, accountId: row.owner_id } : null
  }

  revokeMcpForMember(accountId: string, workspaceId: string, now = Date.now()) {
    this.db
      .prepare('UPDATE mcp_credentials SET revoked_at = ? WHERE account_id = ? AND workspace_id = ? AND revoked_at IS NULL')
      .run(now, accountId, workspaceId)
  }

  accountByToken(token: string, now = Date.now()): Account | null {
    const session = this.db
      .prepare(
        `SELECT a.id, a.name, a.email, a.created_at, a.must_change_password,
                s.id AS session_id, s.expires_at, s.revoked_at
         FROM auth_sessions s
         JOIN accounts a ON a.id = s.account_id
         WHERE s.token_hash = ?`,
      )
      .get(this.digestToken(token)) as
      | {
          id: string
          name: string
          email: string | null
          created_at: number
          must_change_password: number
          session_id: string
          expires_at: number | null
          revoked_at: number | null
        }
      | undefined
    if (session) {
      if (session.revoked_at || (session.expires_at && session.expires_at <= now)) return null
      this.db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(now, session.session_id)
      return {
        id: session.id,
        name: session.name,
        email: session.email ?? '',
        createdAt: session.created_at,
        mustChangePassword: Boolean(session.must_change_password),
      }
    }
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
    if (process.env.BIU_ONLINE === '1' && !row.guest_session_id) return null
    if (row.guest_session_id) {
      if (row.revoked_at || Number(row.expires_at) <= now) return null
      this.db.prepare('UPDATE guest_sessions SET last_seen_at = ? WHERE id = ?').run(now, row.guest_session_id)
    }
    return { id: row.id, name: row.name, email: row.email ?? '', createdAt: row.created_at }
  }

  requiresPasswordChange(accountId: string) {
    const row = this.db
      .prepare('SELECT must_change_password FROM accounts WHERE id = ?')
      .get(accountId) as { must_change_password?: number } | undefined
    return Boolean(row?.must_change_password)
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

  renameWorkspace(actorId: string, workspaceId: string, name: string): Workspace {
    this.requireManager(actorId, workspaceId)
    const trimmed = name.trim()
    if (!trimmed) throw new CollabError('空间名称不能为空', 400)
    if (trimmed.length > 40) throw new CollabError('空间名称不能超过 40 个字符', 400)
    this.db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(trimmed, workspaceId)
    const workspace = this.listWorkspaces(actorId).find((row) => row.id === workspaceId)
    if (!workspace) throw new CollabError('空间不存在', 404)
    return workspace
  }

  addMember(actorId: string, workspaceId: string, accountId: string, now = Date.now()) {
    this.requireManager(actorId, workspaceId)
    this.requireAccount(accountId)
    this.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, account_id, role, created_at)
         VALUES (?, ?, 'member', ?)
         ON CONFLICT(workspace_id, account_id) DO UPDATE SET
           role = CASE WHEN workspace_members.member_kind = 'external' THEN 'member' ELSE workspace_members.role END,
           member_kind = CASE WHEN workspace_members.member_kind = 'external' THEN 'member' ELSE workspace_members.member_kind END`,
      )
      .run(workspaceId, accountId, now)
    this.reconcileAccountGrantScopes(workspaceId, accountId)
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
      this.reconcileAccountGrantScopes(invite.workspace_id, actorId)
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
    viewId = '',
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const normalizedView = viewId.trim()
    if (normalizedView) {
      this.requireViewSharer(actorId, workspaceId, collection)
    } else {
      const resource = { type: 'record' as const, workspaceId, ...this.recordKey(collection, recordId) }
      const decision = this.authorization.authorize(
        { type: 'account', accountId: actorId, workspaceId },
        'resource:manage-permissions',
        resource,
      )
      if (!decision.allowed) throw new CollabError('没有权限', 403)
    }
    const raw = inviteToken()
    const invite = {
      id: id('inv'),
      token: raw,
      workspaceId,
      kind: 'guest' as const,
      collection,
      recordId: normalizedView ? '' : recordId,
      viewId: normalizedView,
      role: resourceRole,
      expiresAt: now + Math.max(1, Math.min(24 * 30, expiresInHours)) * 60 * 60 * 1000,
    }
    this.db
      .prepare(
        `INSERT INTO workspace_invites
          (id, token_hash, workspace_id, kind, role, collection, record_id, view_id, resource_role,
           expires_at, max_uses, use_count, created_by, created_at)
         VALUES (?, ?, ?, 'guest', 'viewer', ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      )
      .run(
        invite.id,
        tokenHash(raw),
        workspaceId,
        collection,
        normalizedView ? '' : recordId,
        normalizedView,
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
      if (invite.view_id) {
        this.writeViewGrant(
          invite.workspace_id,
          invite.collection,
          invite.view_id,
          'account',
          accountId,
          invite.resource_role,
          invite.created_by,
          now,
        )
      } else {
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
        this.reconcileRecordScope(invite.workspace_id, invite.collection, invite.record_id)
      }
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
      viewId: invite.view_id,
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
    const affectedRecords = this.recordGrantKeysForAccount(workspaceId, accountId)
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
      this.db.prepare(
        `DELETE FROM view_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?`,
      ).run(workspaceId, accountId)
      this.db.prepare(
        `DELETE FROM plugin_assignments
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?`,
      ).run(workspaceId, accountId)
      this.db
        .prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
        .run(workspaceId, accountId)
      for (const record of affectedRecords) {
        this.reconcileRecordScope(workspaceId, record.collection, record.record_id)
      }
      this.revokeMcpForMember(accountId, workspaceId)
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
    this.reconcileRecordScope(workspaceId, collection, recordId)
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
    this.reconcileRecordScope(workspaceId, collection, recordId)
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

  workspacePerson(actorId: string) {
    const workspaceId = this.accountActiveWorkspace(actorId)
    if (!workspaceId) return null
    const row = this.db
      .prepare(
        `SELECT COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), NULLIF(a.email, ''), '用户') AS name
         FROM workspace_members m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.workspace_id = ? AND m.account_id = ?`,
      )
      .get(workspaceId, actorId) as { name: string } | undefined
    return row ? { accountId: actorId, workspaceId, name: row.name } : null
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

  /** 远程工作区在本机留一份成员关系，方便文件权限查询。 */
  upsertPulledWorkspace(input: { accountId: string; id: string; name: string; ownerId?: string; role?: string; createdAt?: number }) {
    const id = input.id.trim()
    if (!id || id === this.homeWorkspaceId()) return
    const name = input.name.trim() || '在线'
    const now = input.createdAt || Date.now()
    const existing = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(id) as { id: string } | undefined
    if (!existing) {
      this.db
        .prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
        .run(id, name, input.ownerId || input.accountId, now)
    } else {
      this.db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id)
    }
    const role = input.role === 'owner' || input.role === 'admin' || input.role === 'viewer' ? input.role : 'member'
    this.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, account_id, role, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(workspace_id, account_id) DO UPDATE SET role = excluded.role`,
      )
      .run(id, input.accountId, role, now)
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

  canAccessPlugin(accountId: string, workspaceId: string, pluginId: string) {
    if (!accountId || !workspaceId || !pluginId || !this.isMember(accountId, workspaceId)) return false
    return this.hasPluginLoad(accountId, workspaceId, pluginId)
  }

  hasPluginLoad(accountId: string, workspaceId: string, pluginId: string) {
    if (!accountId || !workspaceId || !pluginId) return false
    const row = this.db
      .prepare(
        `SELECT 1 AS ok FROM plugin_loads
         WHERE workspace_id = ? AND account_id = ? AND plugin_id = ?`,
      )
      .get(workspaceId, accountId, pluginId) as { ok?: number } | undefined
    return Boolean(row)
  }

  pluginLoadsFor(accountId: string, workspaceId: string) {
    if (!accountId || !workspaceId) return []
    const rows = this.db
      .prepare(
        `SELECT plugin_id FROM plugin_loads
         WHERE workspace_id = ? AND account_id = ?
         ORDER BY plugin_id`,
      )
      .all(workspaceId, accountId) as Array<{ plugin_id: string }>
    return rows.map((row) => row.plugin_id)
  }

  loadedPluginIds() {
    const rows = this.db
      .prepare('SELECT DISTINCT plugin_id FROM plugin_loads ORDER BY plugin_id')
      .all() as Array<{ plugin_id: string }>
    return rows.map((row) => row.plugin_id)
  }

  setPluginLoad(accountId: string, workspaceId: string, pluginId: string, loaded: boolean, now = Date.now()) {
    this.requireMember(accountId, workspaceId)
    const id = pluginId.trim()
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) throw new CollabError('插件 ID 不合法', 400)
    if (loaded) {
      this.db
        .prepare(
          `INSERT INTO plugin_loads (workspace_id, account_id, plugin_id, loaded_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(workspace_id, account_id, plugin_id)
           DO UPDATE SET loaded_at = excluded.loaded_at`,
        )
        .run(workspaceId, accountId, id, now)
      return
    }
    this.db
      .prepare('DELETE FROM plugin_loads WHERE workspace_id = ? AND account_id = ? AND plugin_id = ?')
      .run(workspaceId, accountId, id)
  }

  availablePluginIds(accountId: string, workspaceId: string) {
    if (!this.isMember(accountId, workspaceId)) return []
    const rows = this.db
      .prepare('SELECT DISTINCT plugin_id FROM plugin_assignments WHERE workspace_id = ? ORDER BY plugin_id')
      .all(workspaceId) as Array<{ plugin_id: string }>
    return rows
      .map((row) => row.plugin_id)
      .filter((pluginId) => this.canAccessPlugin(accountId, workspaceId, pluginId))
  }

  ensurePluginOwnerAssignments(pluginId: string, now = Date.now()) {
    const existing = this.db
      .prepare('SELECT 1 AS ok FROM plugin_assignments WHERE plugin_id = ? LIMIT 1')
      .get(pluginId)
    if (existing) return 0
    const inserted = this.db
      .prepare(
        `INSERT OR IGNORE INTO plugin_assignments
          (workspace_id, plugin_id, plugin_version, subject_type, subject_id, created_by, created_at)
         SELECT w.id, ?, '', 'account', w.owner_id, w.owner_id, ?
         FROM workspaces w`,
      )
      .run(pluginId, now)
    return Number(inserted.changes)
  }

  listPluginAssignments(actorId: string, workspaceId: string, pluginId = '') {
    this.requireMember(actorId, workspaceId)
    const role = this.workspaceRole(actorId, workspaceId)
    if (role !== 'owner' && role !== 'admin') {
      return this.db
        .prepare(
          `SELECT workspace_id, plugin_id, plugin_version, subject_type, subject_id, created_by, created_at
           FROM plugin_assignments
           WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
             AND (? = '' OR plugin_id = ?)
           ORDER BY plugin_id`,
        )
        .all(workspaceId, actorId, pluginId, pluginId)
    }
    return this.db
      .prepare(
        `SELECT workspace_id, plugin_id, plugin_version, subject_type, subject_id, created_by, created_at
         FROM plugin_assignments
         WHERE workspace_id = ? AND (? = '' OR plugin_id = ?)
         ORDER BY plugin_id, subject_type, subject_id`,
      )
      .all(workspaceId, pluginId, pluginId)
  }

  grantPluginAssignment(
    actorId: string,
    workspaceId: string,
    pluginId: string,
    subject: PluginAssignmentSubject,
    pluginVersion = '',
    now = Date.now(),
  ) {
    this.requireMember(actorId, workspaceId)
    const normalizedPlugin = pluginId.trim()
    const subjectId = subject.id.trim()
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(normalizedPlugin)) throw new CollabError('插件 ID 不合法', 400)
    if (!subjectId) throw new CollabError('授权对象不能为空', 400)
    const role = this.workspaceRole(actorId, workspaceId)
    const manager = role === 'owner' || role === 'admin'
    if (!manager && (subject.type !== 'account' || subjectId !== actorId)) {
      throw new CollabError('普通成员只能为自己启用插件', 403)
    }
    if (subject.type === 'account') this.requireMember(subjectId, workspaceId)
    if (subject.type !== 'account' && subject.type !== 'member_view') {
      throw new CollabError('插件授权对象不合法', 400)
    }
    const approved = this.db
      .prepare(
        `SELECT 1 AS ok FROM plugin_packages
         WHERE id = ? AND trust_state = 'approved'
         LIMIT 1`,
      )
      .get(normalizedPlugin)
    if (!approved) throw new CollabError('插件未安装或尚未批准', 409)
    this.db
      .prepare(
        `INSERT INTO plugin_assignments
          (workspace_id, plugin_id, plugin_version, subject_type, subject_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, plugin_id, subject_type, subject_id)
         DO UPDATE SET plugin_version = excluded.plugin_version,
                       created_by = excluded.created_by,
                       created_at = excluded.created_at`,
      )
      .run(workspaceId, normalizedPlugin, pluginVersion.trim(), subject.type, subjectId, actorId, now)
    this.auditPlugin(actorId, workspaceId, normalizedPlugin, 'assignment.grant', { subject }, now)
    return { workspaceId, pluginId: normalizedPlugin, subjectType: subject.type, subjectId }
  }

  revokePluginAssignment(
    actorId: string,
    workspaceId: string,
    pluginId: string,
    subject: PluginAssignmentSubject,
    now = Date.now(),
  ) {
    this.requireMember(actorId, workspaceId)
    const role = this.workspaceRole(actorId, workspaceId)
    const manager = role === 'owner' || role === 'admin'
    if (!manager && (subject.type !== 'account' || subject.id !== actorId)) {
      throw new CollabError('普通成员只能为自己停用插件', 403)
    }
    const removed = this.db
      .prepare(
        `DELETE FROM plugin_assignments
         WHERE workspace_id = ? AND plugin_id = ? AND subject_type = ? AND subject_id = ?`,
      )
      .run(workspaceId, pluginId, subject.type, subject.id)
    if (!removed.changes) throw new CollabError('插件授权不存在', 404)
    this.auditPlugin(actorId, workspaceId, pluginId, 'assignment.revoke', { subject }, now)
    return { workspaceId, pluginId, subjectType: subject.type, subjectId: subject.id }
  }

  listPluginAudit(actorId: string, workspaceId = '', limit = 100) {
    if (!workspaceId) throw new CollabError('需要空间', 400)
    const role = this.workspaceRole(actorId, workspaceId)
    if (role !== 'owner' && role !== 'admin') throw new CollabError('没有插件审计权限', 403)
    return this.db
      .prepare(
        `SELECT id, account_id, workspace_id, plugin_id, action, detail_json, created_at
         FROM plugin_audit_log
         WHERE (? = '' OR workspace_id = ?)
         ORDER BY id DESC LIMIT ?`,
      )
      .all(workspaceId, workspaceId, Math.max(1, Math.min(500, limit)))
      .map((row) => {
        const value = row as Record<string, unknown>
        return { ...value, detail: JSON.parse(String(value.detail_json || '{}')) }
      })
  }

  recordPluginPackage(
    actorId: string,
    input: PluginPackageInput,
    now = Date.now(),
  ) {
    this.db
      .prepare(
        `INSERT INTO plugin_packages
          (id, version, package_hash, package_path, source_kind, trust_state, tenant_mode,
           has_web, has_host, manifest_json, installed_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id, version) DO UPDATE SET
           package_hash = excluded.package_hash,
           package_path = excluded.package_path,
           trust_state = excluded.trust_state,
           tenant_mode = excluded.tenant_mode,
           has_web = excluded.has_web,
           has_host = excluded.has_host,
           manifest_json = excluded.manifest_json,
           installed_by = excluded.installed_by,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.id,
        input.version,
        input.packageHash,
        input.packagePath,
        input.sourceKind,
        input.trustState,
        input.tenantMode,
        input.hasWeb ? 1 : 0,
        input.hasHost ? 1 : 0,
        JSON.stringify(input.manifest ?? {}),
        actorId,
        now,
        now,
      )
    this.auditPlugin(actorId, '', input.id, 'package.install', { version: input.version }, now)
  }

  syncInstalledPluginPackage(
    input: PluginPackageInput,
    now = Date.now(),
  ) {
    const actorId =
      currentAccountId() ||
      (
        this.db.prepare('SELECT id FROM accounts ORDER BY created_at, id LIMIT 1').get() as { id?: string } | undefined
      )?.id ||
      ''
    if (!actorId) return false
    this.recordPluginPackage(actorId, input, now)
    return true
  }

  removePluginPackage(actorId: string, pluginId: string, now = Date.now()) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM plugin_assignments WHERE plugin_id = ?').run(pluginId)
      this.db.prepare('DELETE FROM plugin_workspace_config WHERE plugin_id = ?').run(pluginId)
      this.db.prepare('DELETE FROM plugin_account_config WHERE plugin_id = ?').run(pluginId)
      this.db.prepare('DELETE FROM plugin_packages WHERE id = ?').run(pluginId)
      this.auditPlugin(actorId, '', pluginId, 'package.uninstall', {}, now)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  claim(actorId: string, workspaceId: string, collection: string, recordId: string, now = Date.now()): RecordHead {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const current = this.head(workspaceId, key.collection, key.recordId)
      const elsewhere = this.db
        .prepare(
          `SELECT workspace_id FROM record_owners
           WHERE collection = ? AND record_id = ? AND workspace_id != ? LIMIT 1`,
        )
        .get(key.collection, key.recordId, workspaceId) as { workspace_id?: string } | undefined
      if (elsewhere) throw new CollabError('这条记录已经属于另一个空间', 409)
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
    if (!this.head(input.workspaceId, key.collection, key.recordId)) {
      this.claim(input.actorId, input.workspaceId, key.collection, key.recordId, now)
    }
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
    return rows.map((row) => this.mapOp(row))
  }

  /** 只返回这个账号有权阅读的变更。桌面端拉取用这个，避免把同空间其他人的私有记录带下去。 */
  visibleOpsSince(actorId: string, workspaceId: string, after = 0): SyncOp[] {
    return this.opsSince(actorId, workspaceId, after).filter((op) =>
      this.authorization.authorize(
        { type: 'account', accountId: actorId, workspaceId },
        'resource:read',
        { type: 'record', workspaceId, collection: op.collection, recordId: op.recordId },
      ).allowed,
    )
  }

  fieldValue(
    actorId: string,
    workspaceId: string,
    collection: string,
    recordId: string,
    field: string,
  ): { version: number; value: unknown } | null {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    const allowed = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:read',
      { type: 'record', workspaceId, collection: key.collection, recordId: key.recordId },
    ).allowed
    if (!allowed) return null
    const current = this.head(workspaceId, key.collection, key.recordId)
    if (!current) return null
    const row = this.db
      .prepare(
        `SELECT value_json FROM sync_ops
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND field = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(workspaceId, key.collection, key.recordId, field) as { value_json: string } | undefined
    return { version: current.version, value: row ? (JSON.parse(row.value_json) as unknown) : null }
  }

  private mapOp(row: {
    id: number
    workspace_id: string
    collection: string
    record_id: string
    field: string
    value_json: string
    version: number
    author_id: string
    created_at: number
  }): SyncOp {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      collection: row.collection,
      recordId: row.record_id,
      field: row.field,
      value: JSON.parse(row.value_json) as unknown,
      version: row.version,
      authorId: row.author_id,
      createdAt: row.created_at,
    }
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
    const elsewhere = this.db
      .prepare(
        `SELECT workspace_id FROM record_owners
         WHERE collection = ? AND record_id = ? AND workspace_id != ? LIMIT 1`,
      )
      .get(collection, recordId, workspaceId) as { workspace_id?: string } | undefined
    if (elsewhere) throw new CollabError('这条记录已经属于另一个空间', 409)
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
    if (process.env.BIU_ONLINE === '1' && (!caller || !workspaceId)) return false
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
    return {
      ...this.accessRows(workspaceId, collection, recordId),
      viewGrants: this.viewGrantShares(workspaceId, collection),
      roleChain: this.authorization.roleChain(actorId, {
        type: 'record',
        workspaceId,
        collection,
        recordId,
      }),
    }
  }

  viewGrantAudiences(workspaceId: string, collection: string) {
    return this.db
      .prepare(
        `SELECT g.view_id, g.subject_type, g.subject_id, g.granted_by, COALESCE(m.member_kind, '') AS member_kind
         FROM view_grants g
         LEFT JOIN workspace_members m
           ON g.subject_type = 'account'
          AND m.workspace_id = g.workspace_id
          AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ?
         ORDER BY g.created_at`,
      )
      .all(workspaceId, collection) as Array<{
        view_id: string
        subject_type: 'account' | 'member_view'
        subject_id: string
        granted_by: string
        member_kind: string
      }>
  }

  private viewGrantShares(workspaceId: string, collection: string) {
    const people = this.db
      .prepare(
        `SELECT g.view_id, g.granted_by, a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), '未设置') AS name,
                COALESCE(a.email, '') AS email, g.role, COALESCE(m.member_kind, '') AS member_kind
         FROM view_grants g
         JOIN accounts a ON g.subject_type = 'account' AND a.id = g.subject_id
         LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ? AND g.subject_type = 'account'
         ORDER BY g.created_at`,
      )
      .all(workspaceId, collection) as Array<{
        view_id: string
        granted_by: string
        id: string
        name: string
        email: string
        role: string
        member_kind: string
      }>
    const memberViews = this.db
      .prepare(
        `SELECT view_id, granted_by, subject_id AS id, role
         FROM view_grants
         WHERE workspace_id = ? AND collection = ? AND subject_type = 'member_view'
         ORDER BY created_at`,
      )
      .all(workspaceId, collection) as Array<{ view_id: string; granted_by: string; id: string; role: string }>
    return [
      ...people.map((row) => ({
        viewId: row.view_id,
        subjectType: 'account' as const,
        subjectId: row.id,
        role: row.role,
        name: row.name,
        email: row.email,
        grantedBy: row.granted_by,
        memberKind: row.member_kind === 'external' || row.member_kind === 'guest' ? row.member_kind : 'member' as const,
      })),
      ...memberViews.map((row) => ({
        viewId: row.view_id,
        subjectType: 'member_view' as const,
        subjectId: row.id,
        role: row.role,
        name: row.id,
        email: '',
        grantedBy: row.granted_by,
        memberKind: 'member' as const,
      })),
    ]
  }

  shareWithEmail(
    actorId: string,
    collection: string,
    recordId: string,
    email: string,
    role: ResourceRole = 'editor',
    collaboratorKind: 'internal' | 'external' = 'external',
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
    const resource = { type: 'record' as const, workspaceId, collection, recordId }
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:share',
      resource,
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    const membership = this.db
      .prepare('SELECT member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, account.id) as { member_kind: string } | undefined
    if (collaboratorKind === 'internal') {
      if (membership?.member_kind !== 'member') {
        throw new CollabError('内部协作者必须先加入当前空间', 409)
      }
    } else {
      if (membership?.member_kind === 'member') {
        throw new CollabError('这个账号已经是内部空间成员', 409)
      }
      if (membership?.member_kind === 'guest') {
        throw new CollabError('临时访客不能转为外部协作者', 409)
      }
      this.db
        .prepare(
          `INSERT INTO workspace_members (workspace_id, account_id, role, member_kind, created_at)
           VALUES (?, ?, 'member', 'external', ?)
           ON CONFLICT(workspace_id, account_id) DO NOTHING`,
        )
        .run(workspaceId, account.id, now)
    }
    this.authorization.grant(actorId, resource, 'account', account.id, role, now)
    this.reconcileRecordScope(workspaceId, collection, recordId)
    return this.accessRows(workspaceId, collection, recordId)
  }

  revokeRecordGrant(
    actorId: string,
    collection: string,
    recordId: string,
    subjectType: 'account' | 'group' | 'member_view',
    subjectId: string,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const resource = { type: 'record' as const, workspaceId, collection, recordId }
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:manage-permissions',
      resource,
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    const policy = this.db
      .prepare(
        `SELECT owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as { owner_account_id?: string } | undefined
    if (subjectType === 'account' && subjectId === policy?.owner_account_id) {
      throw new CollabError('不能移除数据创建者', 400)
    }
    const removed = this.db
      .prepare(
        `DELETE FROM record_grants
         WHERE workspace_id = ? AND collection = ? AND record_id = ?
           AND subject_type = ? AND subject_id = ?`,
      )
      .run(workspaceId, collection, recordId, subjectType, subjectId)
    if (!removed.changes) throw new CollabError('协作者不存在', 404)
    if (subjectType === 'account') this.cleanupExternalMembership(workspaceId, subjectId)
    this.reconcileRecordScope(workspaceId, collection, recordId)
    return this.accessRows(workspaceId, collection, recordId)
  }

  viewAccess(actorId: string, collection: string, viewId: string) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireViewSharer(actorId, workspaceId, collection)
    return this.viewAccessRows(workspaceId, collection, viewId)
  }

  shareViewWithEmail(
    actorId: string,
    collection: string,
    viewId: string,
    email: string,
    role: ResourceRole = 'editor',
    collaboratorKind: 'internal' | 'external' = 'external',
    now = Date.now(),
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const normalizedView = viewId.trim()
    if (!normalizedView) throw new CollabError('视图不能为空', 400)
    this.requireViewSharer(actorId, workspaceId, collection, normalizedView)
    const normalized = email.trim().toLowerCase()
    if (!normalized) throw new CollabError('邮箱不能为空', 400)
    const account = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
    if (!account) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    this.ensureCollaboratorMembership(workspaceId, account.id, collaboratorKind, now)
    this.writeViewGrant(workspaceId, collection, normalizedView, 'account', account.id, role, actorId, now)
    return this.viewAccessRows(workspaceId, collection, normalizedView)
  }

  grantViewMemberView(
    actorId: string,
    collection: string,
    viewId: string,
    memberViewId: string,
    role: ResourceRole,
    now = Date.now(),
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const normalizedView = viewId.trim()
    const normalizedMemberView = memberViewId.trim()
    if (!normalizedView || !normalizedMemberView) throw new CollabError('成员视图不能为空', 400)
    this.requireViewSharer(actorId, workspaceId, collection, normalizedView)
    this.writeViewGrant(workspaceId, collection, normalizedView, 'member_view', normalizedMemberView, role, actorId, now)
    return this.viewAccessRows(workspaceId, collection, normalizedView)
  }

  revokeViewGrant(
    actorId: string,
    collection: string,
    viewId: string,
    subjectType: 'account' | 'member_view',
    subjectId: string,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireViewSharer(actorId, workspaceId, collection, viewId)
    const removed = this.db
      .prepare(
        `DELETE FROM view_grants
         WHERE workspace_id = ? AND collection = ? AND view_id = ?
           AND subject_type = ? AND subject_id = ?`,
      )
      .run(workspaceId, collection, viewId, subjectType, subjectId)
    if (!removed.changes) throw new CollabError('协作者不存在', 404)
    if (subjectType === 'account') this.cleanupExternalMembership(workspaceId, subjectId)
    return this.viewAccessRows(workspaceId, collection, viewId)
  }

  collectionOwnership(workspaceId: string, collection: string) {
    const policies = this.db
      .prepare(
        `SELECT record_id, ownership FROM resource_policies
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; ownership: string }>
    const map = new Map<string, 'personal' | 'workspace' | 'shared'>()
    for (const row of policies) {
      map.set(
        row.record_id,
        row.ownership === 'shared' || row.ownership === 'workspace' ? row.ownership : 'personal',
      )
    }
    const owners = this.db
      .prepare(
        `SELECT record_id FROM record_owners WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string }>
    for (const row of owners) {
      if (!map.has(row.record_id)) map.set(row.record_id, 'workspace')
    }
    return map
  }

  viewGrantsFor(workspaceId: string, collection: string) {
    return this.db
      .prepare(
        `SELECT view_id, subject_type, subject_id, role, granted_by
         FROM view_grants
         WHERE workspace_id = ? AND collection = ?
         ORDER BY created_at`,
      )
      .all(workspaceId, collection) as Array<{
        view_id: string
        subject_type: 'account' | 'member_view'
        subject_id: string
        role: ResourceRole
        granted_by: string
      }>
  }

  collectionRecordOwners(workspaceId: string, collection: string) {
    const map = new Map<string, string>()
    const policies = this.db
      .prepare(
        `SELECT record_id, owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; owner_account_id: string }>
    for (const row of policies) {
      if (row.owner_account_id) map.set(row.record_id, row.owner_account_id)
    }
    const owners = this.db
      .prepare(
        `SELECT record_id, owner_id FROM record_owners WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; owner_id: string }>
    for (const row of owners) {
      if (!map.has(row.record_id) && row.owner_id) map.set(row.record_id, row.owner_id)
    }
    return map
  }

  externallySharedRecords(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT DISTINCT g.collection, g.record_id
         FROM record_grants g
         JOIN workspace_members m
           ON m.workspace_id = g.workspace_id
          AND m.account_id = g.subject_id
          AND m.member_kind IN ('external', 'guest')
         WHERE g.workspace_id = ? AND g.subject_type = 'account'
         ORDER BY g.created_at DESC`,
      )
      .all(workspaceId) as Array<{ collection: string; record_id: string }>
    return rows
      .filter((row) =>
        this.authorization.authorize(
          { type: 'account', accountId: actorId, workspaceId },
          'resource:read',
          { type: 'record', workspaceId, collection: row.collection, recordId: row.record_id },
        ).allowed,
      )
      .map((row) => ({ collection: row.collection, record_id: row.record_id }))
  }

  private requireViewSharer(actorId: string, workspaceId: string, collection: string, viewId = '') {
    const row = this.db
      .prepare('SELECT role, member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, actorId) as { role: string; member_kind: string } | undefined
    if (!row) throw new CollabError('不是这个工作区的成员', 403)
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:share',
      { type: 'collection', workspaceId, collection },
    )
    if (decision.allowed) return
    // 全部视图按人隔离，普通成员可以分享自己的那一份，授权只覆盖自己创建的条目。
    if (viewId.startsWith('builtin-all:') && row.role === 'member' && row.member_kind === 'member') return
    throw new CollabError('没有权限', 403)
  }

  private ensureCollaboratorMembership(
    workspaceId: string,
    accountId: string,
    collaboratorKind: 'internal' | 'external',
    now: number,
  ) {
    const membership = this.db
      .prepare('SELECT member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { member_kind: string } | undefined
    if (collaboratorKind === 'internal') {
      if (membership?.member_kind !== 'member') {
        throw new CollabError('内部协作者必须先加入当前空间', 409)
      }
      return
    }
    if (membership?.member_kind === 'member') {
      throw new CollabError('这个账号已经是内部空间成员', 409)
    }
    if (membership?.member_kind === 'guest') {
      throw new CollabError('临时访客不能转为外部协作者', 409)
    }
    this.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, account_id, role, member_kind, created_at)
         VALUES (?, ?, 'member', 'external', ?)
         ON CONFLICT(workspace_id, account_id) DO NOTHING`,
      )
      .run(workspaceId, accountId, now)
  }

  private writeViewGrant(
    workspaceId: string,
    collection: string,
    viewId: string,
    subjectType: 'account' | 'member_view',
    subjectId: string,
    role: ResourceRole,
    grantedBy: string,
    now: number,
  ) {
    this.db
      .prepare(
        `INSERT INTO view_grants
          (workspace_id, collection, view_id, subject_type, subject_id, role, granted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, view_id, subject_type, subject_id)
         DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, created_at = excluded.created_at`,
      )
      .run(workspaceId, collection, viewId, subjectType, subjectId, role, grantedBy, now)
  }

  private viewAccessRows(workspaceId: string, collection: string, viewId: string) {
    const people = this.db
      .prepare(
        `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), '未设置') AS name,
                COALESCE(a.email, '') AS email, g.role, m.member_kind
         FROM view_grants g
         JOIN accounts a ON g.subject_type = 'account' AND a.id = g.subject_id
         LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ? AND g.view_id = ? AND g.subject_type = 'account'
         ORDER BY g.created_at`,
      )
      .all(workspaceId, collection, viewId) as Array<{
        id: string
        name: string
        email: string
        role: string
        member_kind: 'member' | 'external' | 'guest'
      }>
    const memberViews = this.db
      .prepare(
        `SELECT subject_id AS id, role
         FROM view_grants
         WHERE workspace_id = ? AND collection = ? AND view_id = ? AND subject_type = 'member_view'
         ORDER BY created_at`,
      )
      .all(workspaceId, collection, viewId) as Array<{ id: string; role: string }>
    return {
      private: people.length + memberViews.length === 0,
      scope: 'personal' as const,
      ownerId: '',
      people: people.map(({ member_kind, ...row }) => ({ ...row, memberKind: member_kind })),
      groups: [] as Array<{ id: string; name: string; role: string }>,
      memberViews,
    }
  }

  private accessRows(workspaceId: string, collection: string, recordId: string) {
    const rows = this.db
      .prepare(
        `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), '未设置') AS name,
                COALESCE(a.email, '') AS email, g.role, m.member_kind
         FROM record_grants g
         JOIN accounts a ON g.subject_type = 'account' AND a.id = g.subject_id
         LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ? AND g.subject_type = 'account'
         ORDER BY g.created_at`,
      )
      .all(workspaceId, collection, recordId) as Array<{
        id: string
        name: string
        email: string
        role: string
        member_kind: 'member' | 'external' | 'guest'
      }>
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
    const policy = this.db
      .prepare(
        `SELECT ownership, owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as
      | { ownership: 'personal' | 'workspace' | 'shared'; owner_account_id: string }
      | undefined
    const collaboratorCount =
      rows.filter((row) => row.id !== policy?.owner_account_id).length + groups.length + memberViews.length
    return {
      private: collaboratorCount === 0,
      scope: policy?.ownership ?? 'personal',
      ownerId: policy?.owner_account_id ?? '',
      people: rows.map(({ member_kind, ...row }) => ({ ...row, memberKind: member_kind })),
      groups,
      memberViews,
    }
  }

  private reconcileRecordScope(workspaceId: string, collection: string, recordId: string) {
    let policy = this.db
      .prepare(
        `SELECT owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as { owner_account_id: string } | undefined
    if (!policy) {
      const owner = this.db
        .prepare(
          `SELECT owner_id FROM record_owners
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .get(workspaceId, collection, recordId) as { owner_id?: string } | undefined
      if (!owner?.owner_id) throw new CollabError('记录不在这个工作区', 404)
      this.db
        .prepare(
          `INSERT INTO resource_policies
            (workspace_id, collection, record_id, ownership, owner_account_id, access_mode,
             member_default_role, parent_collection, parent_record_id, created_by, created_at)
           VALUES (?, ?, ?, 'personal', ?, 'private', 'viewer', '', '', ?, ?)`,
        )
        .run(workspaceId, collection, recordId, owner.owner_id, owner.owner_id, Date.now())
      policy = { owner_account_id: owner.owner_id }
    }
    const rows = this.db
      .prepare(
        `SELECT g.subject_type, g.subject_id, COALESCE(m.member_kind, '') AS member_kind
         FROM record_grants g
         LEFT JOIN workspace_members m
           ON g.subject_type = 'account'
          AND m.workspace_id = g.workspace_id
          AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ?`,
      )
      .all(workspaceId, collection, recordId) as Array<{
        subject_type: string
        subject_id: string
        member_kind: string
      }>
    const collaborators = rows.filter(
      (row) => row.subject_type !== 'account' || row.subject_id !== policy!.owner_account_id,
    )
    const hasExternal = collaborators.some(
      (row) => row.subject_type === 'account' && (row.member_kind === 'external' || row.member_kind === 'guest'),
    )
    const ownership = hasExternal ? 'shared' : collaborators.length ? 'workspace' : 'personal'
    this.db
      .prepare(
        `UPDATE resource_policies
         SET ownership = ?, access_mode = ?
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .run(ownership, collaborators.length ? 'restricted' : 'private', workspaceId, collection, recordId)
    return ownership
  }

  private recordGrantKeysForAccount(workspaceId: string, accountId: string) {
    return this.db
      .prepare(
        `SELECT DISTINCT collection, record_id
         FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?`,
      )
      .all(workspaceId, accountId) as Array<{ collection: string; record_id: string }>
  }

  private reconcileAccountGrantScopes(workspaceId: string, accountId: string) {
    for (const record of this.recordGrantKeysForAccount(workspaceId, accountId)) {
      this.reconcileRecordScope(workspaceId, record.collection, record.record_id)
    }
  }

  private cleanupExternalMembership(workspaceId: string, accountId: string) {
    const membership = this.db
      .prepare(
        `SELECT member_kind FROM workspace_members
         WHERE workspace_id = ? AND account_id = ?`,
      )
      .get(workspaceId, accountId) as { member_kind?: string } | undefined
    if (membership?.member_kind !== 'external') return
    const recordGrant = this.db
      .prepare(
        `SELECT 1 AS ok FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
         LIMIT 1`,
      )
      .get(workspaceId, accountId)
    const viewGrant = this.db
      .prepare(
        `SELECT 1 AS ok FROM view_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
         LIMIT 1`,
      )
      .get(workspaceId, accountId)
    const pluginGrant = this.db
      .prepare(
        `SELECT 1 AS ok FROM plugin_assignments
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
         LIMIT 1`,
      )
      .get(workspaceId, accountId)
    if (recordGrant || viewGrant || pluginGrant) return
    this.db
      .prepare(`DELETE FROM workspace_members WHERE workspace_id = ? AND account_id = ? AND member_kind = 'external'`)
      .run(workspaceId, accountId)
    this.revokeMcpForMember(accountId, workspaceId)
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
        `SELECT id, workspace_id, kind, role, collection, record_id, view_id, resource_role,
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
          view_id: string
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

  private ensureBuiltInRoot(now = Date.now()) {
    if (process.env.BIU_ONLINE !== '1') return false
    const existing = this.db
      .prepare(`SELECT id FROM accounts WHERE lower(email) = 'root' LIMIT 1`)
      .get() as { id?: string } | undefined
    const accountId = existing?.id ?? (
      this.db.prepare(`SELECT 1 AS ok FROM accounts WHERE id = 'acc_root'`).get() ? id('acc') : 'acc_root'
    )
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (!existing) {
        this.db
          .prepare(
            `INSERT INTO accounts
              (id, name, token, password_hash, created_at, email, active_workspace_id, must_change_password)
             VALUES (?, 'root', ?, ?, ?, 'root', '', 0)`,
          )
          .run(accountId, randomBytes(24).toString('hex'), hashPassword('123456'), now)
      } else {
        this.db.prepare('UPDATE accounts SET must_change_password = 0 WHERE id = ?').run(accountId)
      }
      this.db.exec('COMMIT')
      return !existing
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private workspaceRole(accountId: string, workspaceId: string): WorkspaceRole {
    const role = this.requireMember(accountId, workspaceId)
    if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') return role
    throw new CollabError('空间角色不合法', 403)
  }

  private auditPlugin(
    accountId: string,
    workspaceId: string,
    pluginId: string,
    action: string,
    detail: unknown,
    now = Date.now(),
  ) {
    this.db
      .prepare(
        `INSERT INTO plugin_audit_log
          (account_id, workspace_id, plugin_id, action, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(accountId, workspaceId, pluginId, action, JSON.stringify(detail ?? {}), now)
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
