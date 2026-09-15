import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import { schemaSearchHaystack } from '@biu/type-file-system'
import {
  countFilterRules,
  encodeListFilter,
  matchListFilterRecord,
  normalizeSorts,
  resolveViewFilterTree,
  sortRecordsBy,
  type FilterGroup,
  type SortRule,
} from '../query-logic.ts'
import type { SavedView } from './saved-view.ts'

export type ShareQueryState = {
  q: string
  sorts: SortRule[]
  filterTree: FilterGroup
}

export function shareQueryStorageKey(token: string) {
  return `fsdb.share.query:${token}`
}

export function shareQueryFromView(view?: Partial<SavedView>): ShareQueryState {
  return {
    q: String(view?.query ?? ''),
    sorts: normalizeSorts(view?.sorts, view?.sortField || 'title', view?.sortDir === 'desc' ? 'desc' : 'asc'),
    filterTree: resolveViewFilterTree({
      filters: view?.filters,
      filterTree: view?.filterTree,
    }),
  }
}

export function loadShareQuery(token: string, fallback: ShareQueryState): ShareQueryState {
  try {
    const raw = localStorage.getItem(shareQueryStorageKey(token))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<ShareQueryState>
    return {
      q: typeof parsed.q === 'string' ? parsed.q : fallback.q,
      sorts: Array.isArray(parsed.sorts) ? normalizeSorts(parsed.sorts, fallback.sorts[0]?.field, fallback.sorts[0]?.dir) : fallback.sorts,
      filterTree: parsed.filterTree ? resolveViewFilterTree({ filterTree: parsed.filterTree, filters: {} }) : fallback.filterTree,
    }
  } catch {
    return fallback
  }
}

export function saveShareQuery(token: string, state: ShareQueryState) {
  try {
    localStorage.setItem(shareQueryStorageKey(token), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function applyShareQuery(
  records: DbRecord[],
  schema: CollectionSchema,
  state: ShareQueryState,
  contents: Record<string, unknown> = {},
) {
  const filter = encodeListFilter({}, countFilterRules(state.filterTree) ? state.filterTree : undefined)
  const needle = state.q.trim().toLowerCase()
  const matched = records.filter((row) => {
    if (!matchListFilterRecord(row, filter, schema)) return false
    if (!needle) return true
    const bits = [
      schemaSearchHaystack(row),
      ...Object.values(row).map((item) => (item == null ? '' : String(item))),
      schemaSearchHaystack(contents[row.id] ?? ''),
      typeof contents[row.id] === 'string' ? String(contents[row.id]) : '',
    ]
    return bits.join(' ').toLowerCase().includes(needle)
  })
  return sortRecordsBy(matched, state.sorts)
}
