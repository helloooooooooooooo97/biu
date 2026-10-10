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
export const NOTICES_COLLECTION_PATH = '/notices'
export const PAGE_BLOCKS_COLLECTION_PATH = '/page-blocks'
export const PAGES_COLLECTION_PATH = '/pages'
export const TASKS_COLLECTION_PATH = '/tasks'
export const TRASH_COLLECTION_PATH = '/trash'
export const WORKSPACE_MEMBERS_COLLECTION_PATH = '/workspace-members'

/** 数据侧栏记录行按 parentId 嵌套：只有页面和任务。 */
export function isRecordTreeCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return normalized === PAGES_COLLECTION_PATH || normalized === TASKS_COLLECTION_PATH
}

const SYSTEM_COLLECTION_ORDER = [
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  NOTICES_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
] as const

/** 用户表侧栏顺序。组件和合集是反查索引，不排在这里。 */
const USER_COLLECTION_ORDER = ['/sessions', '/tasks', '/pages', '/plugins'] as const

/** 从当前用户能看到的用户数据反查出来，每人一份，没有分享。 */
const INDEX_COLLECTION_ORDER = [PAGE_BLOCKS_COLLECTION_PATH, FACETS_COLLECTION_PATH] as const

/** 成员、视图、通知、回收站由系统维护，侧栏归在系统数据。会话事件不进文件系统。 */
export function isSystemCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return (SYSTEM_COLLECTION_ORDER as readonly string[]).includes(normalized)
}

export function isIndexCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return (INDEX_COLLECTION_ORDER as readonly string[]).includes(normalized)
}

export function sortDataCollections<T extends { path: string }>(tables: T[]): { user: T[]; index: T[]; system: T[] } {
  const user: T[] = []
  const index: T[] = []
  const system: T[] = []
  for (const table of tables) {
    if (isSystemCollection(table.path)) system.push(table)
    else if (isIndexCollection(table.path)) index.push(table)
    else user.push(table)
  }
  const rank = (order: readonly string[], path: string) => {
    const idx = order.indexOf(normalizeCollectionPath(path))
    return idx >= 0 ? idx : 50
  }
  user.sort((a, b) => rank(USER_COLLECTION_ORDER, a.path) - rank(USER_COLLECTION_ORDER, b.path) || a.path.localeCompare(b.path))
  index.sort((a, b) => rank(INDEX_COLLECTION_ORDER, a.path) - rank(INDEX_COLLECTION_ORDER, b.path) || a.path.localeCompare(b.path))
  system.sort((a, b) => rank(SYSTEM_COLLECTION_ORDER, a.path) - rank(SYSTEM_COLLECTION_ORDER, b.path) || a.path.localeCompare(b.path))
  return { user, index, system }
}

export function viewsCatalogSource(search: string): string {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('source')
  return raw ? normalizeCollectionPath(raw) : ''
}
