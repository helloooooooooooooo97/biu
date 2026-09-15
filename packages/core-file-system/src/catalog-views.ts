import type { CollectionInfo } from '@biu/type-file-system'
import { normalizeCollectionPath } from './paths.ts'
import { normalizeSavedView, type SavedView } from './web/saved-view.ts'

const ALL_PREFIX = 'builtin-all:'

export type TableRef = {
  path: string
  label?: string
  view?: { title?: string } | null
}

export function builtinCatalogViewId(collectionPath: string) {
  return `builtin:${normalizeCollectionPath(collectionPath)}`
}

const TAG_PREFIX = 'builtin-tag:'

const BLOCK_PREFIX = 'builtin-block:'

export function isBuiltinCatalogViewId(id: string) {
  return (
    id.startsWith('builtin:') &&
    !id.startsWith(ALL_PREFIX) &&
    !id.startsWith(TAG_PREFIX) &&
    !id.startsWith(BLOCK_PREFIX)
  )
}

export function builtinTagViewId(tagId: string) {
  return `${TAG_PREFIX}${String(tagId ?? '').trim()}`
}

export function isBuiltinTagViewId(id: string) {
  return id.startsWith(TAG_PREFIX)
}

export function tagIdFromViewId(id: string) {
  return isBuiltinTagViewId(id) ? id.slice(TAG_PREFIX.length) : ''
}

export function builtinAllViewId(collectionPath: string) {
  return `${ALL_PREFIX}${normalizeCollectionPath(collectionPath)}`
}

export function isBuiltinAllViewId(id: string) {
  return id.startsWith(ALL_PREFIX)
}

export function isBuiltinAllViewForCollection(id: string, collectionPath: string) {
  if (!isBuiltinAllViewId(id)) return false
  return normalizeCollectionPath(id.slice(ALL_PREFIX.length)) === normalizeCollectionPath(collectionPath)
}

export function isReadOnlyViewId(id: string) {
  return isBuiltinAllViewId(id) || isBuiltinCatalogViewId(id) || isBuiltinTagViewId(id) || isBuiltinBlockKindViewId(id)
}

export function collectionNoun(table: TableRef) {
  const path = normalizeCollectionPath(table.path)
  return (table.view?.title ?? table.label ?? path.replace(/^\//, '')) || '记录'
}

/** 分享/面包屑用：内置视图不在 saved-views 里，不能把路径 id 当名称。 */
export function displayNameForView(viewId: string, table: TableRef, storedName?: string) {
  const named = String(storedName ?? '').trim()
  if (named) return named
  const id = String(viewId ?? '').trim()
  if (isBuiltinAllViewId(id)) return builtinAllView(table).name
  if (isBuiltinCatalogViewId(id)) {
    const path = normalizeCollectionPath(id.slice('builtin:'.length))
    if (normalizeCollectionPath(table.path) === path) return collectionNoun(table)
    return collectionNoun({ path, label: path.replace(/^\//, '') })
  }
  if (isBuiltinTagViewId(id)) return stubBuiltinTagView(id)?.name || collectionNoun(table)
  if (isBuiltinBlockKindViewId(id)) return stubBuiltinBlockKindView(id)?.name || collectionNoun(table)
  return collectionNoun(table)
}

export function builtinAllView(table: TableRef): SavedView {
  const path = normalizeCollectionPath(table.path)
  return normalizeSavedView({
    id: builtinAllViewId(path),
    name: `全部${collectionNoun({ ...table, path })}`,
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: [],
    groupBy: '',
    tree: true,
    wrap: false,
    truncate: true,
    query: '',
    builtin: true,
  })
}

export function stubBuiltinAllView(id: string): SavedView | null {
  if (!isBuiltinAllViewId(id)) return null
  const path = normalizeCollectionPath(id.slice(ALL_PREFIX.length))
  return builtinAllView({ path, label: path.replace(/^\//, '') })
}

export function builtinCatalogViews(tables: CollectionInfo[]): SavedView[] {
  return tables
    .filter((table) => table.path && table.path !== '/')
    .map((table) => {
      const path = normalizeCollectionPath(table.path)
      return normalizeSavedView({
        id: builtinCatalogViewId(path),
        name: table.view?.title ?? table.label ?? path.replace(/^\//, ''),
        mode: 'table',
        sortField: 'title',
        sortDir: 'asc',
        filters: { tablePath: path },
        columns: [],
        groupBy: '',
        tree: true,
        wrap: false,
        truncate: true,
        query: '',
        builtin: true,
      })
    })
}

function userViews(user: SavedView[]): SavedView[] {
  return user.filter((view) => !view.builtin && !isReadOnlyViewId(view.id))
}

export function mergeCatalogViews(tables: CollectionInfo[], user: SavedView[]): SavedView[] {
  const viewsTable = tables.find((table) => normalizeCollectionPath(table.path) === '/views') ?? {
    path: '/views',
    label: '视图',
    view: { title: '视图' },
  }
  return [builtinAllView(viewsTable), ...builtinCatalogViews(tables), ...userViews(user)]
}

export function mergeTableViews(table: TableRef | undefined, user: SavedView[]): SavedView[] {
  const extra = userViews(user)
  if (!table?.path || table.path === '/') return extra
  return [builtinAllView(table), ...extra]
}

export type BlockKindRef = { kind: string; label: string }

export function builtinBlockKindViewId(kind: string) {
  return `${BLOCK_PREFIX}${String(kind ?? '').trim()}`
}

export function isBuiltinBlockKindViewId(id: string) {
  return id.startsWith(BLOCK_PREFIX)
}

export function blockKindFromViewId(id: string) {
  return isBuiltinBlockKindViewId(id) ? id.slice(BLOCK_PREFIX.length) : ''
}

export function builtinBlockKindView(block: BlockKindRef): SavedView {
  const kind = String(block.kind ?? '').trim()
  return normalizeSavedView({
    id: builtinBlockKindViewId(kind),
    name: String(block.label ?? '').trim() || kind,
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: { blockKind: kind },
    columns: [],
    groupBy: '',
    tree: true,
    wrap: false,
    truncate: true,
    query: '',
    builtin: true,
  })
}

export function stubBuiltinBlockKindView(id: string): SavedView | null {
  if (!isBuiltinBlockKindViewId(id)) return null
  const kind = blockKindFromViewId(id)
  if (!kind) return null
  return builtinBlockKindView({ kind, label: kind })
}

export function stubAnyBuiltinView(id: string): SavedView | null {
  return stubBuiltinBlockKindView(id) ?? stubBuiltinCatalogView(id) ?? stubBuiltinTagView(id) ?? stubBuiltinAllView(id)
}

/** 内置视图按 id 带锁定筛选。组件类型视图一定带 blockKind，不依赖列表里有没有这条。 */
export function catalogLockFilters(
  viewId: string | null | undefined,
  listed: Array<{ id: string; builtin?: boolean; filters?: Record<string, string> }> = [],
): Record<string, string> {
  const key = String(viewId ?? '').trim()
  if (!key) return {}
  const stub = stubAnyBuiltinView(key)
  if (stub) return { ...(stub.filters ?? {}) }
  const current = listed.find((view) => view.id === key)
  return current?.builtin ? { ...(current.filters ?? {}) } : {}
}

/** /page-blocks：全部组件 + 每种已登记块一条只读视图。 */
export function mergePageBlockViews(table: TableRef | undefined, kinds: BlockKindRef[], user: SavedView[]): SavedView[] {
  const extra = userViews(user)
  const unique = new Map<string, BlockKindRef>()
  for (const item of kinds) {
    const kind = String(item.kind ?? '').trim()
    if (!kind || unique.has(kind)) continue
    unique.set(kind, { kind, label: String(item.label ?? '').trim() || kind })
  }
  const kindViews = [...unique.values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))
    .map(builtinBlockKindView)
  if (!table?.path || table.path === '/') return [...kindViews, ...extra]
  return [builtinAllView(table), ...kindViews, ...extra]
}

export type TagRef = { id: string; label: string }

export function builtinTagView(tag: TagRef): SavedView {
  const id = String(tag.id ?? '').trim()
  return normalizeSavedView({
    id: builtinTagViewId(id),
    name: tag.label || id,
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: { tag: id },
    columns: ['title', 'table'],
    groupBy: '',
    tree: true,
    wrap: false,
    truncate: true,
    query: '',
    builtin: true,
  })
}

export function stubBuiltinTagView(id: string): SavedView | null {
  if (!isBuiltinTagViewId(id)) return null
  const tagId = tagIdFromViewId(id)
  if (!tagId) return null
  return builtinTagView({ id: tagId, label: tagId })
}

/** 收集表里的一行：打开原始表里的那条记录。 */
export function stampRowOpenTarget(row: { tablePath?: unknown; sourceId?: unknown }) {
  const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
  const recordId = String(row.sourceId ?? '').trim()
  if (!collection || collection === '/' || !recordId) return null
  return { collection, recordId }
}

/** 路由里已经是 builtin: 时，即使本地还没合并登记表，也能先还原筛选。 */
export function stubBuiltinCatalogView(id: string): SavedView | null {
  if (!isBuiltinCatalogViewId(id)) return null
  const path = normalizeCollectionPath(id.slice('builtin:'.length))
  return normalizeSavedView({
    id: builtinCatalogViewId(path),
    name: path.replace(/^\//, '') || 'views',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: { tablePath: path },
    columns: [],
    groupBy: '',
    tree: true,
    wrap: false,
    truncate: true,
    query: '',
    builtin: true,
  })
}

/** /views 表里的一行：打开时应跳到该视图对应表，而不是看视图记录自己的属性。 */
export function catalogRowOpenTarget(row: { tablePath?: unknown; viewId?: unknown }) {
  const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
  const viewId = String(row.viewId ?? '').trim()
  if (!collection || collection === '/' || !viewId) return null
  return { collection, viewId }
}
