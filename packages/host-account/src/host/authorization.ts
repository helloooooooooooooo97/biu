import type { DatabaseSync } from 'node:sqlite'
import { currentAccountId } from '@biu/host-plugin-loader/data-dir'

export type Actor =
  | { type: 'account'; accountId: string; workspaceId: string }
  | { type: 'agent'; accountId: string; delegatedBy: string; workspaceId: string; sessionId?: string }
  | { type: 'public-link'; shareTokenId: string; workspaceId?: string }

export type Action =
  | 'resource:list'
  | 'resource:read'
  | 'resource:create'
  | 'resource:create-child'
  | 'resource:update'
  | 'resource:move'
  | 'resource:delete'
  | 'resource:restore'
  | 'resource:share'
  | 'resource:manage-permissions'
  | 'workspace:invite'
  | 'workspace:remove-member'
  | 'workspace:update'
  | 'workspace:delete'

export type ResourceRef =
  | { type: 'workspace'; workspaceId: string }
  | { type: 'collection'; workspaceId: string; collection: string }
  | { type: 'record'; workspaceId: string; collection: string; recordId: string }

export type ResourceRole = 'viewer' | 'editor' | 'manager' | 'owner'
export type AccessMode = 'inherit' | 'private' | 'members' | 'restricted'

export type Decision =
  | {
      allowed: true
      effectiveRole: ResourceRole
      source: 'ownership' | 'direct-grant' | 'group-grant' | 'workspace-default' | 'inherited' | 'legacy'
    }
  | {
      allowed: false
      reason:
        | 'UNAUTHENTICATED'
        | 'NOT_A_MEMBER'
        | 'WRONG_WORKSPACE'
        | 'UNKNOWN_RESOURCE'
        | 'PRIVATE_RESOURCE'
        | 'INSUFFICIENT_PERMISSION'
        | 'RELATION_CYCLE'
    }

export type ResourcePolicyInput = {
  ownership?: 'personal' | 'workspace'
  accessMode?: AccessMode
  memberDefaultRole?: 'viewer' | 'editor'
  parentCollection?: string
  parentRecordId?: string
}

type PolicyRow = {
  workspace_id: string
  collection: string
  record_id: string
  ownership: 'personal' | 'workspace'
  owner_account_id: string
  access_mode: AccessMode
  member_default_role: 'viewer' | 'editor'
  parent_collection: string
  parent_record_id: string
}

const ROLE_RANK: Record<ResourceRole, number> = { viewer: 1, editor: 2, manager: 3, owner: 4 }

function maxRole(roles: ResourceRole[]) {
  return roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0] ?? null
}

function requiredRole(action: Action): ResourceRole {
  switch (action) {
    case 'resource:list':
    case 'resource:read':
      return 'viewer'
    case 'resource:create':
    case 'resource:create-child':
    case 'resource:update':
      return 'editor'
    case 'resource:move':
    case 'resource:delete':
    case 'resource:restore':
    case 'resource:share':
    case 'resource:manage-permissions':
      return 'manager'
    default:
      return 'owner'
  }
}

export class AuthorizationService {
  constructor(
    private db: DatabaseSync,
    private activeWorkspaceFor: (accountId: string) => string | null,
  ) {}

  currentActor(): Actor | null {
    const accountId = currentAccountId()
    if (!accountId) return null
    const workspaceId = this.activeWorkspaceFor(accountId)
    return workspaceId ? { type: 'account', accountId, workspaceId } : null
  }

  authorize(actor: Actor | null, action: Action, resource: ResourceRef): Decision {
    if (!actor || actor.type === 'public-link') return { allowed: false, reason: 'UNAUTHENTICATED' }
    if (actor.workspaceId !== resource.workspaceId) return { allowed: false, reason: 'WRONG_WORKSPACE' }
    const membership = this.membership(actor.accountId, resource.workspaceId)
    if (!membership) return { allowed: false, reason: 'NOT_A_MEMBER' }

    if (resource.type === 'workspace') {
      const allowed =
        membership === 'owner' ||
        (membership === 'admin' && action !== 'workspace:delete')
      return allowed
        ? { allowed: true, effectiveRole: membership === 'owner' ? 'owner' : 'manager', source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    if (resource.type === 'collection') {
      if (resource.collection === '/workspace-members') {
        const effectiveRole: ResourceRole =
          membership === 'owner' ? 'owner' : membership === 'admin' ? 'manager' : 'viewer'
        return ROLE_RANK[effectiveRole] >= ROLE_RANK[requiredRole(action)]
          ? { allowed: true, effectiveRole, source: 'workspace-default' }
          : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
      }
      const managing =
        action === 'resource:share' ||
        action === 'resource:manage-permissions' ||
        action === 'resource:delete'
      if (managing && membership !== 'owner' && membership !== 'admin') {
        return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
      }
      return {
        allowed: true,
        effectiveRole: membership === 'owner' || membership === 'admin' ? 'manager' : 'editor',
        source: 'workspace-default',
      }
    }

    if (resource.collection === '/workspace-members') {
      const effectiveRole: ResourceRole =
        membership === 'owner' ? 'owner' : membership === 'admin' ? 'manager' : 'viewer'
      return ROLE_RANK[effectiveRole] >= ROLE_RANK[requiredRole(action)]
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }
    if (resource.collection === '/views') {
      const effectiveRole: ResourceRole = membership === 'owner' ? 'owner' : 'manager'
      return ROLE_RANK[effectiveRole] >= ROLE_RANK[requiredRole(action)]
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    const resolved = this.effectiveRole(actor.accountId, resource, new Set(), 0)
    if (!resolved) return { allowed: false, reason: 'PRIVATE_RESOURCE' }
    if ('reason' in resolved) return resolved
    if (ROLE_RANK[resolved.effectiveRole] < ROLE_RANK[requiredRole(action)]) {
      return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }
    return { allowed: true, ...resolved }
  }

  authorizeCurrent(action: Action, resource: ResourceRef) {
    return this.authorize(this.currentActor(), action, resource)
  }

  requireCurrent(action: Action, resource: ResourceRef) {
    const decision = this.authorizeCurrent(action, resource)
    if (!decision.allowed) throw new Error(`permission denied: ${decision.reason}`)
    return decision
  }

  filterCurrent<T>(action: Action, resources: Array<{ resource: ResourceRef; value: T }>) {
    const actor = this.currentActor()
    return resources.filter(({ resource }) => this.authorize(actor, action, resource).allowed).map(({ value }) => value)
  }

  attach(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    input: ResourcePolicyInput = {},
    now = Date.now(),
  ) {
    const parentRecordId = input.parentRecordId?.trim() ?? ''
    const parentCollection = parentRecordId ? (input.parentCollection?.trim() || resource.collection) : ''
    const accessMode = input.accessMode ?? (parentRecordId ? 'inherit' : 'private')
    const ownership = input.ownership ?? 'personal'
    this.db
      .prepare(
        `INSERT INTO resource_policies
          (workspace_id, collection, record_id, ownership, owner_account_id, access_mode,
           member_default_role, parent_collection, parent_record_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, record_id) DO NOTHING`,
      )
      .run(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        ownership,
        actor.accountId,
        accessMode,
        input.memberDefaultRole ?? 'viewer',
        parentCollection,
        parentRecordId,
        actor.accountId,
        now,
      )
    this.grant(actor.accountId, resource, 'account', actor.accountId, 'owner', now)
  }

  grant(
    actorId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    subjectType: 'account' | 'group' | 'workspace_role',
    subjectId: string,
    role: ResourceRole,
    now = Date.now(),
  ) {
    const actor: Actor = { type: 'account', accountId: actorId, workspaceId: resource.workspaceId }
    const decision = this.authorize(actor, 'resource:manage-permissions', resource)
    const policy = this.policy(resource)
    if (policy && policy.owner_account_id !== actorId && !decision.allowed) {
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
    }
    this.db
      .prepare(
        `INSERT INTO record_grants
          (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, record_id, subject_type, subject_id)
         DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, created_at = excluded.created_at`,
      )
      .run(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        subjectType,
        subjectId,
        role,
        actorId,
        now,
      )
  }

  move(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    parent: Extract<ResourceRef, { type: 'record' }> | null,
  ) {
    this.validateMove(actor, resource, parent)
    this.db
      .prepare(
        `UPDATE resource_policies
         SET parent_collection = ?, parent_record_id = ?
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .run(
        parent?.collection ?? '',
        parent?.recordId ?? '',
        resource.workspaceId,
        resource.collection,
        resource.recordId,
      )
  }

  validateMove(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    parent: Extract<ResourceRef, { type: 'record' }> | null,
  ) {
    const source = this.authorize(actor, 'resource:move', resource)
    if (!source.allowed) throw new Error(`permission denied: ${source.reason}`)
    if (parent) {
      const target = this.authorize(actor, 'resource:create-child', parent)
      if (!target.allowed) throw new Error(`permission denied: ${target.reason}`)
      if (parent.workspaceId !== resource.workspaceId) throw new Error('permission denied: WRONG_WORKSPACE')
      let cursor: Extract<ResourceRef, { type: 'record' }> | null = parent
      const seen = new Set<string>()
      while (cursor) {
        const key = `${cursor.collection}\t${cursor.recordId}`
        if (key === `${resource.collection}\t${resource.recordId}`) throw new Error('resource parent cycle')
        if (seen.has(key)) throw new Error('resource parent cycle')
        seen.add(key)
        const policy = this.policy(cursor)
        cursor =
          policy?.parent_record_id
            ? {
                type: 'record',
                workspaceId: cursor.workspaceId,
                collection: policy.parent_collection || cursor.collection,
                recordId: policy.parent_record_id,
              }
            : null
      }
    }
  }

  private effectiveRole(
    accountId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    visited: Set<string>,
    depth: number,
  ): Omit<Extract<Decision, { allowed: true }>, 'allowed'> | Extract<Decision, { allowed: false }> | null {
    const key = `${resource.workspaceId}\t${resource.collection}\t${resource.recordId}`
    if (visited.has(key) || depth > 64) return { allowed: false, reason: 'RELATION_CYCLE' }
    visited.add(key)

    const policy = this.policy(resource)
    if (!policy) {
      const legacy = this.db
        .prepare(
          `SELECT 1 AS ok FROM record_owners
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .get(resource.workspaceId, resource.collection, resource.recordId) as { ok: number } | undefined
      return legacy ? { effectiveRole: 'editor', source: 'legacy' } : null
    }
    if (policy.owner_account_id === accountId) return { effectiveRole: 'owner', source: 'ownership' }

    const direct = this.directRole(accountId, resource)
    if (direct) return direct

    if (policy.access_mode === 'private' || policy.access_mode === 'restricted') return null
    if (policy.access_mode === 'members') {
      return { effectiveRole: policy.member_default_role, source: 'workspace-default' }
    }
    if (policy.access_mode === 'inherit' && policy.parent_record_id) {
      const inherited = this.effectiveRole(
        accountId,
        {
          type: 'record',
          workspaceId: resource.workspaceId,
          collection: policy.parent_collection || resource.collection,
          recordId: policy.parent_record_id,
        },
        visited,
        depth + 1,
      )
      if (!inherited || 'reason' in inherited) return inherited
      return { effectiveRole: inherited.effectiveRole, source: 'inherited' }
    }
    return null
  }

  private directRole(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    const rows = this.db
      .prepare(
        `SELECT g.subject_type, g.role
         FROM record_grants g
         WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ?
           AND (
             (g.subject_type = 'account' AND g.subject_id = ?)
             OR (g.subject_type = 'workspace_role' AND g.subject_id = ?)
             OR (
               g.subject_type = 'group' AND EXISTS (
                 SELECT 1 FROM workspace_group_members gm
                 JOIN workspace_groups wg ON wg.id = gm.group_id
                 WHERE gm.group_id = g.subject_id
                   AND gm.account_id = ?
                   AND wg.workspace_id = g.workspace_id
               )
             )
           )`,
      )
      .all(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        accountId,
        this.membership(accountId, resource.workspaceId) ?? '',
        accountId,
      ) as Array<{ subject_type: 'account' | 'group' | 'workspace_role'; role: ResourceRole }>
    const role = maxRole(rows.map((row) => row.role))
    if (!role) return null
    const source = rows.some((row) => row.subject_type === 'account' && row.role === role)
      ? 'direct-grant'
      : rows.some((row) => row.subject_type === 'group' && row.role === role)
        ? 'group-grant'
        : 'workspace-default'
    return { effectiveRole: role, source } as const
  }

  private policy(resource: Extract<ResourceRef, { type: 'record' }>) {
    return this.db
      .prepare(
        `SELECT workspace_id, collection, record_id, ownership, owner_account_id, access_mode,
                member_default_role, parent_collection, parent_record_id
         FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(resource.workspaceId, resource.collection, resource.recordId) as PolicyRow | undefined
  }

  private membership(accountId: string, workspaceId: string) {
    const row = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string } | undefined
    return row?.role ?? null
  }
}
