import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { recordBuiltinValues, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { isRole, type Member, type MemberRole } from './session.ts'
import type { MembersStore } from './members-store.ts'

export function memberRecord(row: Member): DbRecord {
  return {
    id: row.id,
    title: row.name,
    name: row.name,
    role: row.role,
    ...recordBuiltinValues({ createdAt: row.createdAt, updatedAt: row.createdAt }),
  }
}

export function membersCollection(store: MembersStore, inviteUrl: (role: MemberRole) => { url: string; token: string; role: MemberRole }): CollectionSpec {
  return {
    id: 'members',
    path: '/members',
    label: '成员',
    view: {
      moduleId: 'database',
      route: '/members',
      title: '成员',
      inspector: true,
      icon: 'users',
      order: 22,
      blurb: '工作区成员。列表 db_list /members。改姓名/角色 db_update。新建 db_create（title=姓名，role=editor|viewer）。删除 db_delete。owner 发邀请：db_action invite，args.role=editor|viewer，返回 url。',
    },
    schema: {
      labelField: 'title',
      columns: ['title', 'role'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '姓名', writable: true },
        role: {
          type: 'select',
          label: '角色',
          writable: true,
          enum: ['owner', 'editor', 'viewer'],
        },
      },
    },
    records: { update: true, create: true, delete: true },
    list: (query) => {
      let rows = store.list().map(memberRecord)
      if (query?.ids?.length) {
        const want = new Set(query.ids)
        rows = rows.filter((row) => want.has(row.id))
      }
      if (query?.q) {
        const q = query.q.toLowerCase()
        rows = rows.filter((row) => String(row.title).toLowerCase().includes(q))
      }
      return rows
    },
    get: (id) => {
      const row = store.get(id)
      return row ? memberRecord(row) : null
    },
    update: (id, patch) => {
      const role = patch.role != null && isRole(patch.role) ? patch.role : undefined
      const name = patch.title != null ? String(patch.title) : patch.name != null ? String(patch.name) : undefined
      return memberRecord(store.update(id, { name, role }))
    },
    create: (rows) => {
      return rows.map((fields) => {
        const role = isRole(fields.role) ? fields.role : 'editor'
        const name = String(fields.title ?? fields.name ?? '同事')
        if (!store.list().length) return memberRecord(store.bootstrap(name))
        return memberRecord(store.add(name, role === 'owner' ? 'editor' : role))
      })
    },
    remove: (query) => {
      const ids = query.ids ?? []
      for (const id of ids) store.remove(id)
      return ids
    },
    actions: [
      {
        id: 'invite',
        label: '复制邀请链接',
        description: 'owner 生成一次性邀请。args.role=editor 或 viewer。',
        for: 'user',
        placement: ['detail'],
        allowMissing: true,
        parameters: { role: { type: 'string' } },
        run: (_id, _record, args) => {
          const role = isRole(args?.role) && args.role !== 'owner' ? args.role : 'editor'
          return inviteUrl(role)
        },
      },
    ],
  }
}
