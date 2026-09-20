import type { CollectionListQuery, CollectionSpec, DbRecord } from '@biu/type-file-system'
import { REQUIRED_RECORD_FIELDS, recordBuiltinValues } from '@biu/type-file-system'
import { parseStampRecordId, stampRecordId } from './facets-collection.ts'

export type TrashItem = {
  id: string
  path: string
  collection: string
  collectionLabel: string
  title: string
  deletedAt: number
}

export type TrashStore = {
  listTrash(): Promise<{ items: TrashItem[] }>
  restore(path: string, query: CollectionListQuery): Promise<unknown>
  remove(path: string, query: CollectionListQuery): Promise<unknown>
}

function asRow(item: TrashItem): DbRecord {
  const id = stampRecordId(item.collection, item.id)
  return {
    id,
    title: item.title,
    table: item.collectionLabel,
    tablePath: item.collection,
    sourceId: item.id,
    sourcePath: item.path,
    deletedAt: item.deletedAt,
    ...recordBuiltinValues({ createdAt: item.deletedAt, updatedAt: item.deletedAt }),
  }
}

async function rowsOf(store: TrashStore) {
  const listed = await store.listTrash()
  return listed.items.map(asRow)
}

export function trashCollection(store: TrashStore): CollectionSpec {
  return {
    id: 'trash',
    path: '/trash',
    label: '回收站',
    view: {
      moduleId: 'trash',
      route: '/db-trash',
      title: '回收站',
      inspector: false,
      icon: 'trash',
      blurb:
        '已软删除的记录仍在原表，只是列表不显示。列表 db_list /trash。恢复 db_action /trash/<表名::记录id> action=restore。彻底删除 db_action /trash/<表名::记录id> action=delete。不要对原表 purge，除非确定不要了。',
      order: 20,
    },
    records: { update: false, create: false, delete: false },
    schema: {
      labelField: 'title',
      columns: ['title', 'table', 'deletedAt'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题' },
        table: { type: 'string', label: '来源', computed: true },
        tablePath: { type: 'string', label: '表路径', computed: true },
        sourceId: { type: 'string', label: '记录', computed: true },
        sourcePath: { type: 'string', label: '原路径', computed: true },
        deletedAt: { type: 'datetime', label: '删除时间', computed: true, sortable: true },
      },
    },
    actions: [
      {
        id: 'restore',
        label: '恢复',
        description: '去掉删除标记，记录回到原来的表。',
        placement: ['row', 'detail'],
        run: async (id) => {
          const stamp = parseStampRecordId(id)
          if (!stamp) throw new Error(`unknown trash row: ${id}`)
          return store.restore(stamp.collection, { ids: [stamp.recordId] })
        },
      },
      {
        id: 'delete',
        label: '删除',
        description: '从原表彻底删掉，不可恢复。',
        tone: 'danger',
        placement: ['row', 'detail'],
        confirm: '确定彻底删除？不可恢复。',
        run: async (id) => {
          const stamp = parseStampRecordId(id)
          if (!stamp) throw new Error(`unknown trash row: ${id}`)
          return store.remove(stamp.collection, { ids: [stamp.recordId], purge: true })
        },
      },
    ],
    list: async (query?: CollectionListQuery) => {
      let listed = await rowsOf(store)
      if (query?.ids?.length) {
        const want = new Set(query.ids)
        listed = listed.filter((row) => want.has(row.id))
      }
      const q = query?.q?.trim().toLowerCase() ?? ''
      if (q) {
        listed = listed.filter((row) =>
          `${row.id} ${row.title} ${row.table ?? ''} ${row.tablePath ?? ''}`.toLowerCase().includes(q),
        )
      }
      return listed
    },
    get: async (id) => {
      const listed = await rowsOf(store)
      return listed.find((row) => row.id === id) ?? null
    },
  }
}
