import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { noticeToRecord, type NoticesStore } from './notices-store.ts'

export function noticesCollection(store: NoticesStore): CollectionSpec {
  const asRecord = (id: string): DbRecord | null => {
    const row = store.get(id)
    return row ? noticeToRecord(row) : null
  }
  return {
    id: 'notices',
    path: '/notices',
    label: '通知',
    view: {
      moduleId: 'notices',
      route: '/db-notices',
      title: '通知',
      inspector: false,
      icon: 'bell',
      blurb: '给人看的收件箱。列表 db_list /notices。未读 read=false。不要 db_create。系统不再为审批或回合写通知。',
      order: 18,
    },
    records: { update: true, create: false, delete: true },
    schema: {
      labelField: 'title',
      columns: ['title', 'kind', 'read', 'body', 'href', 'createdAt'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题' },
        body: { type: 'string', label: '摘要' },
        kind: { type: 'select', label: '类型', enum: ['approval', 'task', 'session'] },
        read: { type: 'boolean', label: '已读', writable: true },
        href: { type: 'string', label: '跳转' },
        sourceKey: { type: 'string', label: '来源' },
      },
    },
    list: async () => store.list().map((row) => noticeToRecord(row)),
    get: async (id) => asRecord(id),
    update: async (id, patch) => {
      const read =
        patch.read === undefined ? undefined : patch.read === true || patch.read === 'true' || patch.read === 1
      return noticeToRecord(store.update(id, read === undefined ? {} : { read }))
    },
    remove: async (id) => {
      store.remove(id)
    },
  }
}
