import { builtinAllViewId, stubBuiltinAllView, stubBuiltinBlockKindView, stubBuiltinCatalogView, stubBuiltinTagView, isReadOnlyViewId, isBuiltinAllViewForCollection } from '../catalog-views.ts'
import { listCollection } from './db-client.ts'
import { looksLikeFilterTree, normalizeFilterGroup, parseSortsInput } from '../query-logic.ts'
import { normalizeSavedView, type SavedView } from './saved-view.ts'

export function viewsKey(collectionPath: string) {
  return `fsdb.views:${collectionPath}`
}

export function activeViewStorageKey(collectionPath: string) {
  return `fsdb.activeView:${collectionPath}`
}

const memoryViews = new Map<string, SavedView[]>()

export function rememberViews(collectionPath: string, views: SavedView[]) {
  memoryViews.set(collectionPath, views.map((view) => normalizeSavedView(view)))
}

export function loadViews(collectionPath: string): SavedView[] {
  const remembered = memoryViews.get(collectionPath)
  if (remembered?.length) return remembered
  try {
    const raw = localStorage.getItem(viewsKey(collectionPath))
    const parsed = raw ? (JSON.parse(raw) as SavedView[]) : []
    if (parsed.length) return parsed.map((view) => normalizeSavedView(view))
  } catch {
    /* ignore */
  }
  return []
}

export type CrumbRecord = { id: string; label: string; emoji?: string; mascot?: unknown }

const memoryRecords = new Map<string, CrumbRecord[]>()
const memoryRecordMeta = new Map<string, CrumbRecord>()

function recordsKey(collectionPath: string, viewId?: string) {
  return `${collectionPath}\0${viewId ?? ''}`
}

function recordMetaKey(collectionPath: string, recordId: string) {
  return `${collectionPath}\0id:${recordId}`
}

function keepCrumbLabel(row: CrumbRecord, prev?: CrumbRecord) {
  const next = String(row.label ?? '').trim()
  const last = String(prev?.label ?? '').trim()
  if (next && next !== row.id) return next
  if (last && last !== row.id) return last
  return next || last || row.id
}

export function rememberRecords(collectionPath: string, rows: CrumbRecord[], viewId?: string) {
  const painted = rows.map((row) => {
    const last = memoryRecordMeta.get(recordMetaKey(collectionPath, row.id))
    const next = {
      ...last,
      ...row,
      label: keepCrumbLabel(row, last),
      emoji: row.emoji || last?.emoji,
      mascot: row.mascot ?? last?.mascot,
    }
    memoryRecordMeta.set(recordMetaKey(collectionPath, row.id), next)
    return next
  })
  memoryRecords.set(recordsKey(collectionPath, viewId), painted)
}

export function loadRecords(collectionPath: string, viewId?: string): CrumbRecord[] {
  return memoryRecords.get(recordsKey(collectionPath, viewId)) ?? []
}

export function peekRecord(collectionPath: string, recordId: string): CrumbRecord | undefined {
  return memoryRecordMeta.get(recordMetaKey(collectionPath, recordId))
}

export function loadActiveViewId(collectionPath: string, listed: SavedView[]) {
  try {
    const id = localStorage.getItem(activeViewStorageKey(collectionPath))
    if (id && listed.some((view) => view.id === id)) return id
  } catch {
    /* ignore */
  }
  return listed[0]?.id ?? null
}

export function viewForPath(collectionPath: string, routeViewId?: string): SavedView | null {
  const listed = loadViews(collectionPath)
  const fallback = stubBuiltinAllView(builtinAllViewId(collectionPath))
  const preferred =
    (routeViewId
      ? listed.find((item) => item.id === routeViewId) ??
        stubBuiltinCatalogView(routeViewId) ??
        stubBuiltinTagView(routeViewId) ??
        stubBuiltinBlockKindView(routeViewId) ??
        (isBuiltinAllViewForCollection(routeViewId, collectionPath) ? stubBuiltinAllView(routeViewId) : null)
      : undefined) ??
    listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ??
    fallback ??
    listed[0]
  return preferred ? withViewDisplay(collectionPath, normalizeSavedView(preferred)) : null
}

export function defaultViewId(collectionPath: string, routeViewId?: string) {
  return viewForPath(collectionPath, routeViewId)?.id ?? builtinAllViewId(collectionPath)
}

/** 水合时列表可能还没有内置块类型视图；URL 上的 builtin-block: 仍用 stub 还原，不能退回「全部」。 */
export function pickViewForRoute(listed: SavedView[], collectionPath: string, routeViewId?: string) {
  const route = String(routeViewId ?? '').trim()
  if (route) {
    return listed.find((item) => item.id === route) ?? viewForPath(collectionPath, route)
  }
  return listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ?? listed[0] ?? null
}

export type StarredView = { path: string; viewId: string }

const STARRED_VIEWS_KEY = 'fsdb.starredViews'

export function loadStarredViews(): StarredView[] {
  try {
    const raw = localStorage.getItem(STARRED_VIEWS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const rec = item as Record<string, unknown>
      const path = String(rec.path ?? '').trim()
      const viewId = String(rec.viewId ?? '').trim()
      return path && viewId ? [{ path, viewId }] : []
    })
  } catch {
    return []
  }
}

let starredViews = loadStarredViews()
let starredVersion = 0
const starredListeners = new Set<() => void>()

export function getStarredViews() {
  return starredViews
}

export function subscribeStarredViews(fn: () => void) {
  starredListeners.add(fn)
  return () => {
    starredListeners.delete(fn)
  }
}

export function getStarredViewsVersion() {
  return starredVersion
}

export function persistStarredViews(items: StarredView[]) {
  starredViews = items
  starredVersion += 1
  localStorage.setItem(STARRED_VIEWS_KEY, JSON.stringify(items))
  for (const fn of starredListeners) fn()
}

export function pushSavedViews(collectionPath: string, views: SavedView[]) {
  return fetch('/api/db/saved-views', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: collectionPath, views }),
  }).catch(() => undefined)
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function parseViewFilterTree(value: unknown) {
  const raw = parseMaybeJson(value)
  if (!looksLikeFilterTree(raw)) return undefined
  return normalizeFilterGroup(raw)
}

function parseViewFilters(value: unknown): Record<string, string> {
  const raw = parseMaybeJson(value)
  if (looksLikeFilterTree(raw)) return {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
      if (key.startsWith('$')) continue
      out[key] = String(item)
    }
    return out
  }
  return {}
}

export function savedViewFromRecord(row: { viewId?: unknown; title?: unknown; mode?: unknown; sortField?: unknown; sortDir?: unknown; sorts?: unknown; query?: unknown; groupBy?: unknown; columns?: unknown; filters?: unknown; filterTree?: unknown; tree?: unknown; wrap?: unknown; truncate?: unknown; pageSize?: unknown; columnWidths?: unknown }): SavedView | null {
  const id = String(row.viewId ?? '').trim()
  if (!id || isReadOnlyViewId(id)) return null
  const sortDir = row.sortDir === 'desc' ? 'desc' : 'asc'
  const sortField = String(row.sortField ?? 'title')
  const filters = parseViewFilters(row.filters)
  const filterTree = parseViewFilterTree(row.filterTree) ?? (looksLikeFilterTree(parseMaybeJson(row.filters)) ? normalizeFilterGroup(parseMaybeJson(row.filters)) : undefined)
  return normalizeSavedView({
    id,
    name: String(row.title ?? id),
    mode: String(row.mode ?? 'table') as SavedView['mode'],
    sortField,
    sortDir,
    sorts: parseSortsInput(row.sorts, sortField, sortDir),
    query: String(row.query ?? ''),
    groupBy: String(row.groupBy ?? ''),
    columns: Array.isArray(row.columns) ? row.columns.map((item) => String(item)) : [],
    filters,
    filterTree,
    tree: row.tree !== false,
    wrap: Boolean(row.wrap),
    truncate: row.truncate !== false,
    pageSize: Number(row.pageSize) || 50,
    columnWidths: row.columnWidths,
    builtin: false,
  })
}

export async function pullSavedViews() {
  try {
    const page = await listCollection({
      path: '/views',
      limit: 200,
      offset: 0,
      columns: [
        'title',
        'tablePath',
        'viewId',
        'mode',
        'sortField',
        'sortDir',
        'sorts',
        'query',
        'groupBy',
        'columns',
        'filters',
        'filterTree',
        'tree',
        'wrap',
        'truncate',
        'pageSize',
        'columnWidths',
      ],
    })
    const byPath = new Map<string, SavedView[]>()
    for (const row of page.items) {
      const tablePath = String(row.tablePath ?? '').trim()
      const view = savedViewFromRecord(row)
      if (!tablePath || !view) continue
      const list = byPath.get(tablePath) ?? []
      list.push(view)
      byPath.set(tablePath, list)
    }
    for (const [path, views] of byPath) {
      rememberViews(path, views)
      try {
        localStorage.setItem(viewsKey(path), JSON.stringify(views))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export function upsertSavedView(collectionPath: string, view: SavedView) {
  const next = normalizeSavedView({ ...view, builtin: false })
  const stored = loadViews(collectionPath).filter((item) => item.id !== next.id && !item.builtin)
  stored.push(next)
  rememberViews(collectionPath, stored)
  try {
    localStorage.setItem(viewsKey(collectionPath), JSON.stringify(stored))
  } catch {
    /* ignore */
  }
}

export function pushAllSavedViews() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('fsdb.views:')) continue
      const path = key.slice('fsdb.views:'.length)
      const views = loadViews(path)
      if (views.length) pushSavedViews(path, views)
    }
  } catch {
    /* ignore */
  }
}

export function isViewStarred(items: StarredView[], path: string, viewId: string) {
  return items.some((item) => item.path === path && item.viewId === viewId)
}

export function toggleStarredView(items: StarredView[], path: string, viewId: string): StarredView[] {
  if (isViewStarred(items, path, viewId)) return items.filter((item) => item.path !== path || item.viewId !== viewId)
  return [...items, { path, viewId }]
}

export type StarredRecord = { path: string; recordId: string; label?: string; emoji?: string }

const STARRED_RECORDS_KEY = 'fsdb.starredRecords'

export function loadStarredRecords(): StarredRecord[] {
  try {
    const raw = localStorage.getItem(STARRED_RECORDS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const rec = item as Record<string, unknown>
      const path = String(rec.path ?? '').trim()
      const recordId = String(rec.recordId ?? '').trim()
      if (!path || !recordId) return []
      const label = String(rec.label ?? '').trim()
      const emoji = String(rec.emoji ?? '').trim()
      return [{ path, recordId, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}) }]
    })
  } catch {
    return []
  }
}

let starredRecords = loadStarredRecords()
let starredRecordsVersion = 0
const starredRecordListeners = new Set<() => void>()

export function getStarredRecords() {
  return starredRecords
}

export function subscribeStarredRecords(fn: () => void) {
  starredRecordListeners.add(fn)
  return () => {
    starredRecordListeners.delete(fn)
  }
}

export function getStarredRecordsVersion() {
  return starredRecordsVersion
}

export function persistStarredRecords(items: StarredRecord[]) {
  starredRecords = items
  starredRecordsVersion += 1
  localStorage.setItem(STARRED_RECORDS_KEY, JSON.stringify(items))
  for (const fn of starredRecordListeners) fn()
}

export function isRecordStarred(items: StarredRecord[], path: string, recordId: string) {
  return items.some((item) => item.path === path && item.recordId === recordId)
}

export function toggleStarredRecord(
  items: StarredRecord[],
  path: string,
  recordId: string,
  meta?: { label?: string; emoji?: string },
): StarredRecord[] {
  if (isRecordStarred(items, path, recordId)) return items.filter((item) => item.path !== path || item.recordId !== recordId)
  const label = String(meta?.label ?? '').trim()
  const emoji = String(meta?.emoji ?? '').trim()
  return [...items, { path, recordId, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}) }]
}

export function starredRecordLabel(item: StarredRecord) {
  const peeked = peekRecord(item.path, item.recordId)
  const label = String(peeked?.label ?? item.label ?? '').trim()
  return label && label !== item.recordId ? label : label || item.recordId
}

export function starredRecordEmoji(item: StarredRecord) {
  return String(peekRecord(item.path, item.recordId)?.emoji ?? item.emoji ?? '').trim()
}

const DISPLAY_KEYS = [
  'mode',
  'sortField',
  'sortDir',
  'sorts',
  'columns',
  'groupBy',
  'tree',
  'wrap',
  'truncate',
  'query',
  'pageSize',
  'columnWidths',
  'filterTree',
] as const

export type ViewDisplayPatch = Partial<Pick<SavedView, (typeof DISPLAY_KEYS)[number]>>

export function viewDisplayKey(collectionPath: string, viewId: string) {
  return `fsdb.viewDisplay:${collectionPath}:${viewId}`
}

function pickDisplay(patch: Partial<SavedView>): ViewDisplayPatch {
  const next: ViewDisplayPatch = {}
  for (const key of DISPLAY_KEYS) {
    if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key]
  }
  return next
}

export function loadViewDisplay(collectionPath: string, viewId: string): ViewDisplayPatch {
  try {
    const raw = localStorage.getItem(viewDisplayKey(collectionPath, viewId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    return pickDisplay(parsed)
  } catch {
    return {}
  }
}

export function persistViewDisplay(collectionPath: string, viewId: string, patch: Partial<SavedView>) {
  try {
    const next = { ...loadViewDisplay(collectionPath, viewId), ...pickDisplay(patch) }
    localStorage.setItem(viewDisplayKey(collectionPath, viewId), JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** 内置「全部 xx」不能当用户视图存整份，显示项（换行等）单独记。 */
export function withViewDisplay(collectionPath: string, view: SavedView): SavedView {
  const overlay = loadViewDisplay(collectionPath, view.id)
  if (!Object.keys(overlay).length) return normalizeSavedView(view)
  return normalizeSavedView({
    ...view,
    ...overlay,
    id: view.id,
    name: view.name,
    builtin: view.builtin,
    filters: view.filters,
    filterTree: view.builtin ? overlay.filterTree ?? view.filterTree : view.filterTree,
  })
}
