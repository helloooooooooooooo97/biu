import type { CollectionSchema, Database, DbRecord } from '@biu/type-file-system'
import { collectAssetNames } from './assets-store.ts'
import type { SavedViewsStore } from './saved-views.ts'
import { freezeSchema, type ShareSnapshot } from '@biu/host-share/snapshot'
import { collectShareResources } from '@biu/host-share/resources'
import { savedViewRecordPath } from '../paths.ts'
import { displayNameForView, isReadOnlyViewId } from '../catalog-views.ts'
import type { ShareRecord } from './shares-store.ts'
import { asPublicProfile } from '@biu/host-workspace'
import { encodeListFilter, resolveViewFilterTree } from '../query-logic.ts'

const SHARE_LIMIT = 200

function asFilter(view: { filters?: Record<string, string>; filterTree?: unknown }) {
  return encodeListFilter(view.filters ?? {}, resolveViewFilterTree(view as { filters?: Record<string, string>; filterTree?: import('../query-logic.ts').FilterGroup | null }))
}

function asStat(raw: unknown) {
  return raw as { kind?: string; schema?: CollectionSchema; label?: string; view?: { title?: string } | null }
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
    owner: (() => {
      const profile = asPublicProfile()
      return profile.name || profile.avatar ? { name: profile.displayName, avatar: profile.avatar } : undefined
    })(),
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
  const collectionLabel = String(stat.view?.title ?? stat.label ?? share.collection.replace(/^\//, ''))
  const table = { path: share.collection, label: collectionLabel, view: { title: collectionLabel } }
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
      title: String(record.title ?? record.name ?? collectionLabel),
      collectionLabel,
      schema,
      records: [{ ...record, [schema.contentField ?? 'notes']: undefined }],
      contents,
      assets: [...collectAssetNames(record, content, record.banner)],
      banner: record.banner ?? null,
    }, share)
  }
  const stored = savedViews.viewsFor(share.collection).find((item) => item.id === share.viewId)
  const viewName = displayNameForView(share.viewId, table, stored?.name)
  const view = {
    id: share.viewId,
    name: viewName,
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
    title: viewName,
    collectionLabel,
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
