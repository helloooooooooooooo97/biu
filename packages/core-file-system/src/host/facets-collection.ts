import type { CollectionInfo, CollectionListQuery, CollectionSpec, DbRecord } from '@biu/type-file-system'
import { recordBuiltinValues, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { FacetStore, slugFacetId } from './facets-store.ts'
import { normalizeCollectionPath } from '../paths.ts'

function parseFields(raw: unknown) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function stampRecordId(collection: string, recordId: string) {
  const table = normalizeCollectionPath(collection).replace(/^\//, '')
  return `${table}::${recordId}`
}

export function parseStampRecordId(id: string) {
  const raw = String(id ?? '')
  const at = raw.indexOf('::')
  if (at <= 0) return null
  const table = raw.slice(0, at).trim()
  const recordId = raw.slice(at + 2).trim()
  if (!table || !recordId) return null
  return { collection: `/${table}`, recordId }
}

export function facetsCollection(
  store: FacetStore,
  tables: () => Array<Pick<CollectionInfo, 'path' | 'label' | 'id'>> = () => [],
): CollectionSpec {
  const asFacet = (
    id: string,
    label: string,
    fields: unknown[],
    stampCount: number,
    notes = '',
    createdAt = 0,
    updatedAt = 0,
  ): DbRecord => ({
    id,
    title: label,
    fieldCount: fields.length,
    stampCount,
    fields: JSON.stringify(fields),
    notes,
    ...recordBuiltinValues({ createdAt, updatedAt }),
  })

  const tableLabel = (path: string) => {
    const hit = tables().find((item) => item.path === path)
    return hit?.label ?? hit?.id ?? path
  }

  const fromEntry = (id: string, stampCount: number) => {
    const item = store.entry(id)
    if (!item) return asFacet(id, id, [], stampCount)
    return asFacet(
      item.pack.id,
      item.pack.label,
      item.pack.fields,
      stampCount,
      item.notes,
      item.createdAt,
      item.updatedAt,
    )
  }

  const facetRows = () => {
    const counts = store.stampCounts()
    return store.entries().map((item) =>
      asFacet(
        item.pack.id,
        item.pack.label,
        item.pack.fields,
        counts[item.pack.id] ?? 0,
        item.notes,
        item.createdAt,
        item.updatedAt,
      ),
    )
  }

  const stampRows = (facetId: string) => {
    const found = store.collect(facetId)
    const id = found.facet?.id ?? facetId
    return found.items.map((item) => ({
      id: stampRecordId(item.collection, item.id),
      title: item.title || item.id,
      table: tableLabel(item.collection),
      tablePath: item.collection,
      sourceId: item.id,
      facetId: id,
      ...recordBuiltinValues(),
    }))
  }

  return {
    id: 'facets',
    path: '/facets',
    label: '合集',
    view: {
      moduleId: 'facets-db',
      route: '/db-facets',
      title: '合集',
      inspector: true,
      blurb: '工作区全局合集定义，可贴到任意表的记录。列表 db_list /facets；某合集已贴过哪些记录用 filter.facetId。新建 db_create /facets records=[{title}]（id 由标题 slug）。改名或属性 db_update /facets/<id>，fields 为 JSON 数组 [{key,type,label}]。正文 notes 用 db_content。把合集贴到记录并填属性：db_update 那条记录的 facet。一个合集 values 可扁平；多个合集 values 必须按合集 id 分子对象。省略 tags 只改属性，不会撕掉其它合集。本表没有 db_action。',
      order: 31,
      icon: 'rectangle-stack',
    },
    records: { update: true, create: true, delete: true },
    schema: {
      labelField: 'title',
      contentField: 'notes',
      contentBackend: 'editorContent',
      columns: ['title', 'fieldCount', 'stampCount'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '合集', writable: true },
        fieldCount: { type: 'number', label: '字段', computed: true },
        stampCount: { type: 'number', label: '收集', computed: true, sortable: true },
        fields: { type: 'string', label: '属性', writable: true },
        notes: { type: 'file', label: '正文', writable: true },
        table: { type: 'string', label: '来源表', computed: true },
        tablePath: { type: 'string', label: '表路径', computed: true },
        sourceId: { type: 'string', label: '记录', computed: true },
        facetId: { type: 'string', label: '合集', computed: true },
      },
    },
    list: (query?: CollectionListQuery) => {
      const facetFilter = String(query?.filter?.facetId ?? '').trim()
      let listed = facetFilter ? stampRows(facetFilter) : facetRows()
      if (query?.ids?.length) {
        const want = new Set(query.ids)
        listed = listed.filter((row) => want.has(row.id))
      }
      const q = query?.q?.trim().toLowerCase() ?? ''
      if (q) {
        listed = listed.filter((row) => `${row.id} ${row.title} ${row.table ?? ''} ${row.notes ?? ''}`.toLowerCase().includes(q))
      }
      return listed
    },
    get: (id) => {
      const stamp = parseStampRecordId(id)
      if (stamp) {
        for (const facet of store.list()) {
          const hit = stampRows(facet.id).find((row) => row.id === id)
          if (hit) return hit
        }
        return null
      }
      return facetRows().find((row) => row.id === id) ?? null
    },
    create: (rows) =>
      rows.map((fields = {}) => {
        const title = String(fields.title ?? '').trim() || '未命名合集'
        const id = slugFacetId(title, new Set(store.list().map((facet) => facet.id)))
        const pack = store.upsert({ id, label: title, fields: parseFields(fields.fields) }, fields.notes != null ? String(fields.notes) : '')
        return fromEntry(pack.id, 0)
      }),
    update: (id, patch) => {
      if (parseStampRecordId(id)) throw new Error(`cannot update collected row: ${id}`)
      const current = store.get(id)
      if (!current) throw new Error(`unknown 合集: ${id}`)
      const label = patch.title != null ? String(patch.title).trim() || current.label : current.label
      const fields = patch.fields != null ? parseFields(patch.fields) : current.fields
      const notes = patch.notes != null ? String(patch.notes) : store.notes(current.id)
      const pack = store.upsert({ id: current.id, label, fields }, notes)
      return fromEntry(pack.id, store.stampCounts()[pack.id] ?? 0)
    },
    remove: (query) => {
      const ids = query.ids ?? []
      for (const id of ids) {
        if (parseStampRecordId(id)) throw new Error(`cannot delete collected row: ${id}`)
        if (!store.removeFacet(id)) throw new Error(`unknown 合集: ${id}`)
      }
      return ids
    },
  }
}
