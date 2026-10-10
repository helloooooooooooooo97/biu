import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import type { SavedView } from './saved-view.ts'
import { listCollection, readJson } from './db-client.ts'

export const SIDEBAR_PREVIEW_PAGE = 20
export const SIDEBAR_PREVIEW_MAX = 100

export type PreviewPage = {
  items: DbRecord[]
  total: number
  schema?: CollectionSchema
}

export function previewCacheKey(path: string, view: Pick<SavedView, 'id' | 'sortField' | 'sortDir' | 'filters' | 'query' | 'groupBy'>) {
  return `${path}\0${view.id}\0${view.sortField}\0${view.sortDir}\0${view.groupBy ?? ''}\0${JSON.stringify(view.filters ?? {})}\0${view.query ?? ''}`
}

export function normalizeRecordEmoji(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return [...text].slice(0, 2).join('')
}

export function recordPreviewEmoji(row: DbRecord) {
  return normalizeRecordEmoji(row.emoji)
}

export function recordPreviewLabel(row: DbRecord, labelField?: string) {
  if (labelField) {
    const labeled = row[labelField]
    if (labeled != null && String(labeled).trim()) return String(labeled)
  }
  for (const key of ['title', 'name', 'label']) {
    const value = row[key]
    if (value != null && String(value).trim()) return String(value)
  }
  return String(row.id)
}

/** 面包屑与列表共用：labelField 若是 id，改走 title/name，避免只显示编号。 */
export function crumbRecordLabel(row: DbRecord, labelField?: string) {
  return recordPreviewLabel(row, labelField && labelField !== 'id' ? labelField : undefined)
}

export function nextPreviewLimit(loaded: number, total: number) {
  if (loaded >= total) return 0
  return Math.min(SIDEBAR_PREVIEW_PAGE, SIDEBAR_PREVIEW_MAX - loaded, total - loaded)
}

const totalCache = new Map<string, number>()
const totalListeners = new Set<() => void>()
let totalsVersion = 0

export function rememberPreviewTotal(key: string, total: number) {
  if (totalCache.get(key) === total) return
  totalCache.set(key, total)
  totalsVersion += 1
  for (const fn of totalListeners) fn()
}

export function getPreviewTotalsVersion() {
  return totalsVersion
}

export function getPreviewTotal(key: string) {
  return totalCache.get(key)
}

export function subscribePreviewTotals(fn: () => void) {
  totalListeners.add(fn)
  return () => {
    totalListeners.delete(fn)
  }
}

export function viewTotalKey(path: string, view: Pick<SavedView, 'id' | 'sortField' | 'sortDir' | 'filters' | 'query'>) {
  return previewCacheKey(path, view)
}

export async function fetchViewTotal(
  path: string,
  view: Pick<SavedView, 'id' | 'sortField' | 'sortDir' | 'filters' | 'query'>,
) {
  const key = viewTotalKey(path, view)
  const cached = totalCache.get(key)
  if (cached != null) return cached
  const page = await fetchViewPreview(path, view, 0, 1)
  rememberPreviewTotal(key, page.total)
  return page.total
}

export async function writeRecordEmoji(path: string, recordId: string, emoji: string) {
  const next = normalizeRecordEmoji(emoji)
  const body = await readJson<{ value?: DbRecord }>('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `${path}/${recordId}`, content: { emoji: next } }),
  })
  return normalizeRecordEmoji(body.value?.emoji ?? next)
}

export function previewColumns(view: Pick<SavedView, 'groupBy'>) {
  const columns = ['title', 'emoji', 'mascot', 'parentId']
  const groupBy = String(view.groupBy ?? '').trim()
  if (groupBy && !columns.includes(groupBy)) columns.push(groupBy)
  return columns
}

export async function fetchViewPreview(
  path: string,
  view: Pick<SavedView, 'sortField' | 'sortDir' | 'filters' | 'query' | 'groupBy'>,
  offset: number,
  limit = SIDEBAR_PREVIEW_PAGE,
): Promise<PreviewPage> {
  return listCollection({
    path,
    limit: Math.min(limit, SIDEBAR_PREVIEW_PAGE),
    offset,
    query: view.query,
    sortField: view.sortField,
    sortDir: view.sortDir,
    filters: view.filters,
    columns: previewColumns(view),
  })
}
