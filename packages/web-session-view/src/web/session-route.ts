/** URL = 中心舞台。
 * `/` | `/s/:id` | `/s/:id/debug` | 插件 path
 * 数据模块（默认 `/database`）：
 *   `/database` 入口
 *   `/database/:type` 某张表
 *   `/database/:type/view/:viewId` 某个视图
 *   `/database/:type/record/:recordId` 某条记录（无视图时）
 *   `/database/:type/view/:viewId/record/:recordId` 从某个视图打开的记录
 * 旧写法 `/c/` `/v/` `/r/` 仍能解析，写入时改成上面这种。
 * `:type` 为集合 path 去掉前导 `/` 再 encode（`/pages` → `pages`）。
 */
import { matchRegisteredModule, type AppModule } from '@biu/web-app-modules'

export type RouteView = 'chat' | 'debug'

export type InspectorCenterKind = 'session' | 'collection-view' | 'record' | 'task' | 'module'

export type AppRoute =
  | { kind: 'home' }
  | { kind: 'share'; token: string; recordId?: string }
  | { kind: 'session'; sessionId: string; view: RouteView }
  | { kind: 'module'; moduleId: string; path: string }
  | { kind: 'collection-view'; moduleId: string; path: string; collection: string; viewId?: string }
  | { kind: 'record'; moduleId: string; path: string; collection: string; recordId: string; viewId?: string }

const DATABASE_FLAT = /^\/(?:c\/)?([^/]+)(?:\/(?:view|v)\/([^/]+)|\/(?:record|r)\/([^/]+))?$/
const DATABASE_NESTED_RECORD =
  /^\/(?:c\/)?([^/]+)\/(?:view|v)\/([^/]+)\/(?:record|r)\/([^/]+)$/

export function encodeCollectionSeg(path: string) {
  return encodeURIComponent(normalizeCollectionKey(path).replace(/^\//, ''))
}

export function decodeCollectionSeg(seg: string) {
  const raw = decodeURIComponent(seg).trim()
  if (!raw || raw === '/') return '/'
  return raw.startsWith('/') ? raw.replace(/\/+$/, '') || '/' : `/${raw.replace(/\/+$/, '')}`
}

export function normalizeCollectionKey(path: string) {
  const raw = String(path || '/').trim() || '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  if (withSlash === '/') return '/'
  return withSlash.replace(/\/+$/, '') || '/'
}

export function isLegacyDatabasePath(pathname: string, modulePath = '/database') {
  const path = normalizePath(pathname)
  const base = normalizePath(modulePath)
  if (path === base || !path.startsWith(`${base}/`)) return false
  const rest = path.slice(base.length)
  return /^\/c\//.test(rest) || /\/(?:v|r)\//.test(rest)
}

export function parseDatabaseRest(pathname: string, module: AppModule): AppRoute | null {
  const base = normalizePath(module.path)
  const path = normalizePath(pathname)
  if (path === base) return null
  if (!path.startsWith(`${base}/`)) return null
  const rest = path.slice(base.length)
  const nested = rest.match(DATABASE_NESTED_RECORD)
  if (nested?.[1] && nested[2] && nested[3]) {
    return {
      kind: 'record',
      moduleId: module.id,
      path: base,
      collection: decodeCollectionSeg(nested[1]),
      viewId: decodeURIComponent(nested[2]),
      recordId: decodeURIComponent(nested[3]),
    }
  }
  const match = rest.match(DATABASE_FLAT)
  if (!match?.[1]) return { kind: 'module', moduleId: module.id, path: base }
  const collection = decodeCollectionSeg(match[1])
  const viewId = match[2] ? decodeURIComponent(match[2]) : undefined
  const recordId = match[3] ? decodeURIComponent(match[3]) : undefined
  if (recordId) {
    return { kind: 'record', moduleId: module.id, path: base, collection, recordId }
  }
  return { kind: 'collection-view', moduleId: module.id, path: base, collection, viewId }
}

export function parseAppPath(pathname: string, plugins: AppModule[] = []): AppRoute {
  const path = normalizePath(pathname)
  const hit = matchRegisteredModule(path, plugins)
  if (hit) {
    const nested = parseDatabaseRest(path, hit)
    if (nested) return nested
    return { kind: 'module', moduleId: hit.id, path: hit.path }
  }
  if (path === '/') return { kind: 'home' }
  const share = path.match(/^\/share\/([^/]+)(?:\/r\/([^/]+))?$/)
  if (share?.[1]) {
    return {
      kind: 'share',
      token: decodeURIComponent(share[1]),
      ...(share[2] ? { recordId: decodeURIComponent(share[2]) } : {}),
    }
  }
  const match = path.match(/^\/s\/([^/]+)(?:\/(chat|debug|trajectory))?$/)
  if (!match?.[1]) return { kind: 'home' }
  const segment = match[2]
  return {
    kind: 'session',
    sessionId: decodeURIComponent(match[1]),
    view: segment === 'debug' || segment === 'trajectory' ? 'debug' : 'chat',
  }
}

export function isKnownAppPath(pathname: string, plugins: AppModule[] = []): boolean {
  const path = normalizePath(pathname)
  if (path === '/') return true
  if (/^\/share\/[^/]+(?:\/r\/[^/]+)?$/.test(path)) return true
  if (matchRegisteredModule(path, plugins)) return true
  return /^\/s\/[^/]+(?:\/(chat|debug|trajectory))?$/.test(path)
}

export function buildAppPath(route: AppRoute): string {
  if (route.kind === 'home') return '/'
  if (route.kind === 'share') {
    const base = `/share/${encodeURIComponent(route.token)}`
    return route.recordId ? `${base}/r/${encodeURIComponent(route.recordId)}` : base
  }
  if (route.kind === 'module') return route.path || `/${route.moduleId}`
  if (route.kind === 'collection-view' || route.kind === 'record') {
    const base = route.path || `/${route.moduleId}`
    const next = `${normalizePath(base)}/${encodeCollectionSeg(route.collection)}`
    if (route.kind === 'record') {
      const rec = `${next}/record/${encodeURIComponent(route.recordId)}`
      if (route.viewId) return `${next}/view/${encodeURIComponent(route.viewId)}/record/${encodeURIComponent(route.recordId)}`
      return rec
    }
    if (route.viewId) return `${next}/view/${encodeURIComponent(route.viewId)}`
    return next
  }
  if (route.view === 'debug') return `/s/${encodeURIComponent(route.sessionId)}/debug`
  return `/s/${encodeURIComponent(route.sessionId)}`
}

export function routeFromState(sessionId: string | null, view: RouteView): AppRoute {
  if (!sessionId) return { kind: 'home' }
  return { kind: 'session', sessionId, view }
}

export function centerKindFromRoute(route: AppRoute): InspectorCenterKind {
  if (route.kind === 'collection-view') return 'collection-view'
  if (route.kind === 'record') return 'record'
  if (route.kind === 'module') return route.moduleId === 'tasks' ? 'task' : 'module'
  return 'session'
}

export function normalizePath(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}
