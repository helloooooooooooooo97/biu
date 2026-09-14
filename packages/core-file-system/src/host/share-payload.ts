import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import { collectAssetNames } from './assets-store.ts'
import type { SavedViewsStore } from './saved-views.ts'
import { freezeSchema, type ShareSnapshot } from '../share-snapshot.ts'
import type { ShareRecord } from './shares-store.ts'
import { encodeListFilter, resolveViewFilterTree } from '../query-logic.ts'

type ShareDb = {
  stat: (path: string) => Promise<{ kind: string; schema?: CollectionSchema; label?: string }>
  list: (
    path: string,
    filter?: Record<string, unknown>,
    page?: { q?: string; sortField?: string; sortDir?: 'asc' | 'desc'; sorts?: Array<{ field: string; dir: 'asc' | 'desc' }>; limit?: number },
  ) => Promise<{ kind: string; items?: DbRecord[]; schema?: CollectionSchema }>
  read: (path: string) => Promise<{ value?: DbRecord }>
  content: (path: string) => Promise<{ value?: unknown }>
}

const SHARE_LIMIT = 200

function asFilter(view: { filters?: Record<string, string>; filterTree?: unknown }) {
  return encodeListFilter(view.filters ?? {}, resolveViewFilterTree(view as { filters?: Record<string, string>; filterTree?: import('../query-logic.ts').FilterGroup | null }))
}

export async function buildShareSnapshot(
  db: ShareDb,
  savedViews: SavedViewsStore,
  share: ShareRecord,
): Promise<ShareSnapshot> {
  const stat = await db.stat(share.collection)
  if (stat.kind !== 'collection' || !stat.schema) throw new Error('unknown collection')
  const schema = freezeSchema(stat.schema)
  const title = String(stat.label ?? share.collection.replace(/^\//, ''))
  if (share.kind === 'record') {
    const got = await db.read(`${share.collection}/${share.recordId}`)
    const record = got.value
    if (!record?.id) throw new Error('unknown record')
    let content: unknown = null
    try {
      content = (await db.content(`${share.collection}/${record.id}`)).value ?? null
    } catch {
      content = null
    }
    const contents = { [record.id]: content }
    return {
      kind: 'record',
      collection: share.collection,
      viewId: share.viewId,
      recordId: record.id,
      title: String(record.title ?? record.name ?? title),
      schema,
      records: [{ ...record, [schema.contentField ?? 'notes']: undefined }],
      contents,
      assets: [...collectAssetNames(record, content)],
    }
  }
  const stored = savedViews.viewsFor(share.collection).find((item) => item.id === share.viewId)
  const view = {
    id: share.viewId,
    name: String(stored?.name || title),
    query: stored?.query ?? '',
    sortField: stored?.sortField || 'title',
    sortDir: stored?.sortDir === 'desc' ? 'desc' as const : 'asc' as const,
    sorts: stored?.sorts,
    filters: stored?.filters,
    filterTree: stored?.filterTree,
    columns: stored?.columns,
  }
  const listed = await db.list(share.collection, asFilter(view), {
    q: String(view.query ?? ''),
    sortField: view.sortField,
    sortDir: view.sortDir,
    sorts: view.sorts,
    limit: SHARE_LIMIT,
  })
  const records = listed.items ?? []
  const contents: Record<string, unknown> = {}
  for (const row of records) {
    try {
      contents[row.id] = (await db.content(`${share.collection}/${row.id}`)).value ?? null
    } catch {
      contents[row.id] = null
    }
  }
  return {
    kind: 'view',
    collection: share.collection,
    viewId: share.viewId,
    recordId: '',
    title: String(view.name || title),
    schema,
    view,
    records,
    contents,
    assets: [...collectAssetNames(...records, ...Object.values(contents))],
  }
}
