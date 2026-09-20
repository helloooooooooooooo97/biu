import { buildAppPath, type AppRoute } from '@biu/web-session-view'
import { builtinAllViewId } from '../catalog-views.ts'
import { normalizeCollectionPath } from '../paths.ts'

export const DATA_MODULE_ID = 'database'
export const DATA_MODULE_PATH = '/database'
export const DATA_MODULE = { id: DATA_MODULE_ID, label: '数据', path: DATA_MODULE_PATH }

const ROUTE = { moduleId: DATA_MODULE_ID, path: DATA_MODULE_PATH } as const

export function databaseViewPath(collection: string, viewId?: string): string {
  return buildAppPath({
    kind: 'collection-view',
    ...ROUTE,
    collection,
    viewId,
  })
}

/** 内置「全部 xx」视图，数据页默认进这里。 */
export function databaseAllViewPath(collection: string): string {
  return databaseViewPath(collection, builtinAllViewId(collection))
}

export function databaseRecordPath(collection: string, recordId: string, viewId?: string): string {
  return buildAppPath({
    kind: 'record',
    ...ROUTE,
    collection,
    recordId,
    ...(viewId ? { viewId } : {}),
  } satisfies AppRoute)
}

export const VIEWS_COLLECTION_PATH = '/views'
export const FACETS_COLLECTION_PATH = '/facets'
export const EVENTS_COLLECTION_PATH = '/events'
export const NOTICES_COLLECTION_PATH = '/notices'
export const PAGE_BLOCKS_COLLECTION_PATH = '/page-blocks'
export const PAGES_COLLECTION_PATH = '/pages'
export const TASKS_COLLECTION_PATH = '/tasks'
export const TRASH_COLLECTION_PATH = '/trash'

/** 数据侧栏记录行按 parentId 嵌套：只有页面和任务。 */
export function isRecordTreeCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return normalized === PAGES_COLLECTION_PATH || normalized === TASKS_COLLECTION_PATH
}

const SYSTEM_COLLECTION_ORDER = [VIEWS_COLLECTION_PATH, EVENTS_COLLECTION_PATH, NOTICES_COLLECTION_PATH, TRASH_COLLECTION_PATH] as const

/** 用户表侧栏顺序。组件是页面里嵌的块，紧挨页面下面。 */
const USER_COLLECTION_ORDER = ['/sessions', '/tasks', '/pages', '/page-blocks', '/plugins', '/facets'] as const

/** 视图、事件由系统自己记下，侧栏归在系统数据。分面跨所有表，排在插件后面。 */
export function isSystemCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return (SYSTEM_COLLECTION_ORDER as readonly string[]).includes(normalized)
}

export function sortDataCollections<T extends { path: string }>(tables: T[]): { user: T[]; system: T[] } {
  const user: T[] = []
  const system: T[] = []
  for (const table of tables) {
    if (isSystemCollection(table.path)) system.push(table)
    else user.push(table)
  }
  const userRank = (path: string) => {
    const idx = USER_COLLECTION_ORDER.indexOf(normalizeCollectionPath(path) as (typeof USER_COLLECTION_ORDER)[number])
    return idx >= 0 ? idx : 50
  }
  user.sort((a, b) => userRank(a.path) - userRank(b.path) || a.path.localeCompare(b.path))
  system.sort((a, b) => {
    const left = normalizeCollectionPath(a.path)
    const right = normalizeCollectionPath(b.path)
    const leftRank = SYSTEM_COLLECTION_ORDER.indexOf(left as (typeof SYSTEM_COLLECTION_ORDER)[number])
    const rightRank = SYSTEM_COLLECTION_ORDER.indexOf(right as (typeof SYSTEM_COLLECTION_ORDER)[number])
    const aRank = leftRank >= 0 ? leftRank : 50
    const bRank = rightRank >= 0 ? rightRank : 50
    return aRank - bRank || left.localeCompare(right)
  })
  return { user, system }
}

export function viewsCatalogSource(search: string): string {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('source')
  return raw ? normalizeCollectionPath(raw) : ''
}
