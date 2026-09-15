import type { CollectionSchema, Database, DbRecord } from '@biu/type-file-system'
import { collectAssetNames } from './assets-store.ts'
import type { SavedViewsStore } from './saved-views.ts'
import { freezeSchema, type ShareSnapshot } from '../share-snapshot.ts'
import { collectShareResources } from '../share-resources.ts'
import { savedViewRecordPath } from '../paths.ts'
import { isReadOnlyViewId } from '../catalog-views.ts'
import type { ShareRecord } from './shares-store.ts'
import { encodeListFilter, resolveViewFilterTree } from '../query-logic.ts'

const SHARE_LIMIT = 200

function asFilter(view: { filters?: Record<string, string>; filterTree?: unknown }) {
  return encodeListFilter(view.filters ?? {}, resolveViewFilterTree(view as { filters?: Record<string, string>; filterTree?: import('../query-logic.ts').FilterGroup | null }))
}

function asStat(raw: unknown) {
  return raw as { kind?: string; schema?: CollectionSchema; label?: string }
}

function asRecordRead(raw: unknown) {
  return raw as { value?: DbRecord }
}

function asContentRead(raw: unknown) {
  return raw as { value?: unknown }
}

function withResources(
  snap: Omit<ShareSnapshot, 'resources' | 'pluginIds' | 'sharePlugins' | 'allowCopy'>,
  share: ShareRecord,
): ShareSnapshot {
  const resources = collectShareResources(snap.records, snap.contents, {
    skipIds: snap.records.map((row) => String(row.id)),
    includeRecords: share.kind === 'view',
  })
  return {
    ...snap,
    resources: { pages: resources.pages, plugins: resources.plugins, collections: resources.collections },
    pluginIds: resources.pluginIds,
    sharePlugins: share.sharePlugins,
    allowCopy: share.allowCopy,
  }
}

export async function buildShareSnapshot(
  db: Pick<Database, 'stat' | 'list' | 'read' | 'content'>,
  savedViews: SavedViewsStore,
  share: ShareRecord,
): Promise<ShareSnapshot> {
  const stat = asStat(await db.stat(share.collection))
  if (stat.kind !== 'collection' || !stat.schema) throw new Error('unknown collection')
  const schema = freezeSchema(stat.schema)
  const title = String(stat.label ?? share.collection.replace(/^\//, ''))
  if (share.kind === 'record') {
    const got = asRecordRead(await db.read(`${share.collection}/${share.recordId}`))
    const record = got.value
    if (!record?.id) throw new Error('unknown record')
    let content: unknown = null
    try {
      content = asContentRead(await db.content(`${share.collection}/${record.id}`)).value ?? null
    } catch {
      content = null
    }
    const contents = { [record.id]: content }
    return withResources({
      kind: 'record',
      collection: share.collection,
      viewId: share.viewId,
      recordId: record.id,
      title: String(record.title ?? record.name ?? title),
      schema,
      records: [{ ...record, [schema.contentField ?? 'notes']: undefined }],
      contents,
      assets: [...collectAssetNames(record, content, record.banner)],
      banner: record.banner ?? null,
    }, share)
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
    wrap: stored?.wrap,
    truncate: stored?.truncate,
    pageSize: stored?.pageSize,
  }
  const listed = (await db.list(share.collection, asFilter(view), {
    q: String(view.query ?? ''),
    sortField: view.sortField,
    sortDir: view.sortDir,
    sorts: view.sorts,
    limit: SHARE_LIMIT,
  })) as { items?: DbRecord[] }
  const records = listed.items ?? []
  const contents: Record<string, unknown> = {}
  for (const row of records) {
    try {
      contents[row.id] = asContentRead(await db.content(`${share.collection}/${row.id}`)).value ?? null
    } catch {
      contents[row.id] = null
    }
  }
  const banner = await readShareBanner(db, share.collection, share.viewId)
  return withResources({
    kind: 'view',
    collection: share.collection,
    viewId: share.viewId,
    recordId: '',
    title: String(view.name || title),
    schema,
    view,
    records,
    contents,
    assets: [...collectAssetNames(...records, ...Object.values(contents), banner)],
    banner,
  }, share)
}

async function readShareBanner(
  db: Pick<Database, 'read'>,
  collection: string,
  viewId: string,
) {
  // The host deliberately has no banner for built-in/read-only views.
  // Keep the share page on the same rule even if an old banner overlay
  // still exists for that synthetic /views row.
  if (isReadOnlyViewId(viewId)) return null
  const path = savedViewRecordPath(collection, viewId)
  if (!path) return null
  try {
    return asRecordRead(await db.read(path)).value?.banner ?? null
  } catch {
    return null
  }
}
