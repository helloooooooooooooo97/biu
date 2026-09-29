import { currentAccountId } from '@biu/host-plugin-loader/data-dir'
import {
  recordBuiltinValues,
  REQUIRED_RECORD_FIELDS,
  type CollectionListQuery,
  type CollectionSpec,
  type DbRecord,
} from '@biu/type-file-system'
import type { CollabStore } from './store.ts'

export const WORKSPACE_MEMBERS_COLLECTION_PATH = '/workspace-members'

type MemberRow = {
  id: string
  name: string
  email: string
  role: string
  member_kind: 'member' | 'external'
  created_at: number
}

function asRecord(row: MemberRow): DbRecord {
  return {
    id: row.id,
    title: row.name || row.email,
    name: row.name,
    email: row.email,
    role: row.role,
    membershipKind: row.member_kind,
    joinedAt: row.created_at,
    ...recordBuiltinValues({ createdAt: row.created_at, updatedAt: row.created_at }),
  }
}

export function workspaceMembersCollection(store: CollabStore): CollectionSpec {
  const rows = () => store.currentMembers().map(asRecord)
  const list = async (query?: CollectionListQuery) => {
    let items = rows()
    if (query?.ids?.length) {
      const wanted = new Set(query.ids)
      items = items.filter((row) => wanted.has(row.id))
    }
    const q = query?.q?.trim().toLowerCase() ?? ''
    if (q) {
      items = items.filter((row) => `${row.title} ${row.email} ${row.role}`.toLowerCase().includes(q))
    }
    return items
  }
  const identity = () => {
    const actorId = currentAccountId()
    const workspaceId = store.activeWorkspaceId()
    if (!actorId || !workspaceId) throw new Error('permission denied: UNAUTHENTICATED')
    return { actorId, workspaceId }
  }
  return {
    id: 'workspace-members',
    path: WORKSPACE_MEMBERS_COLLECTION_PATH,
    label: '成员',
    view: {
      moduleId: 'workspace-members-db',
      route: '/db-workspace-members',
      title: '成员',
      inspector: false,
      blurb:
        '当前工作区成员目录。db_list 查看成员；Owner 可用 db_update 将 role 限定为 owner|admin|member|viewer；Owner/Admin 可用 db_create 邀请、db_delete 移除其有权管理的成员。viewer 只能查看获准的数据，不能创建或编辑。修改 tags 等元数据不会改变角色。',
      order: 18,
      icon: 'users',
    },
    records: { update: true, create: true, delete: true },
    schema: {
      labelField: 'title',
      columns: ['title', 'email', 'role', 'membershipKind', 'joinedAt'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '账号名' },
        name: { type: 'string', label: '空间账号名' },
        email: { type: 'string', label: '登录邮箱' },
        role: {
          type: 'select',
          label: '角色',
          enum: ['owner', 'admin', 'member', 'viewer'],
          enumLabels: { owner: '所有者', admin: '管理者', member: '编辑者', viewer: '查看者' },
          writable: true,
        },
        membershipKind: {
          type: 'select',
          label: '成员类型',
          enum: ['member', 'external', 'guest'],
          enumLabels: { member: '空间成员', external: '外部成员', guest: '临时访客' },
        },
        joinedAt: { type: 'datetime', label: '加入时间', sortable: true },
      },
    },
    actions: [
      {
        id: 'invite',
        label: '邀请成员',
        description:
          '按登录邮箱把已注册账号加入当前工作区。path 固定用 /workspace-members/invite，args: { email: "member@example.com" }。',
        for: 'agent',
        placement: [],
        allowMissing: true,
        requiredAction: 'resource:create',
        parameters: {
          type: 'object',
          properties: { email: { type: 'string', description: '待加入成员的登录邮箱' } },
          required: ['email'],
        },
        run: (_id, _record, args = {}) => {
          const { actorId, workspaceId } = identity()
          return store.addMemberByEmail(actorId, workspaceId, String(args.email ?? ''))
        },
      },
    ],
    list,
    get: async (id) => rows().find((row) => row.id === id) ?? null,
    create: async (records) => {
      const { actorId, workspaceId } = identity()
      const created: DbRecord[] = []
      for (const record of records) {
        const email = String(record.email ?? '').trim()
        const members = store.addMemberByEmail(actorId, workspaceId, email)
        const member = members.find((row) => row.email === email.toLowerCase())
        if (!member) throw new Error('member was not created')
        created.push(asRecord(member))
      }
      return created
    },
    update: async (id, patch) => {
      const { actorId, workspaceId } = identity()
      if (!('role' in patch)) {
        const current = rows().find((row) => row.id === id)
        if (!current) throw new Error('member not found')
        return current
      }
      const role = String(patch.role ?? '')
      if (role !== 'owner' && role !== 'admin' && role !== 'member' && role !== 'viewer') {
        throw new Error('role must be owner, admin, member or viewer')
      }
      return asRecord(store.updateMemberRole(actorId, workspaceId, id, role))
    },
    remove: async (query) => {
      const { actorId, workspaceId } = identity()
      const ids = query.ids ?? []
      for (const id of ids) store.removeMember(actorId, workspaceId, id)
      return ids
    },
  }
}
