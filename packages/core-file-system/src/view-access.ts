import { parseBuiltinScopeViewId } from './catalog-views.ts'
import { matchListFilterRecord } from './query-logic.ts'
import type { DbRecord } from '@biu/type-file-system'

export type DataScopeName = 'personal' | 'workspace' | 'shared'
export type ViewGrantRole = 'viewer' | 'editor' | 'manager' | 'owner'

const ROLE_RANK: Record<ViewGrantRole, number> = { viewer: 1, editor: 2, manager: 3, owner: 4 }

export function highestViewRole(roles: ViewGrantRole[]) {
  return roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0] ?? null
}

export function viewFiltersForGrant(
  viewId: string,
  saved: Array<{ id: string; filters?: Record<string, unknown> }>,
) {
  const scopeView = parseBuiltinScopeViewId(viewId)
  if (scopeView) {
    const base = saved.find((view) => view.id === scopeView.viewId)
    return { scope: scopeView.scope, filters: stripScope(base?.filters) }
  }
  const view = saved.find((item) => item.id === viewId)
  if (!view) return null
  const declared = view.filters?.$scope
  const scope = declared === 'personal' || declared === 'workspace' || declared === 'shared' ? declared : ''
  return { scope, filters: stripScope(view.filters) }
}

export function recordMatchesGrantedView(
  record: DbRecord,
  viewId: string,
  saved: Array<{ id: string; filters?: Record<string, unknown> }>,
  scope: DataScopeName | null,
) {
  const resolved = viewFiltersForGrant(viewId, saved)
  if (!resolved) return false
  if (resolved.scope && scope !== resolved.scope) return false
  return matchListFilterRecord(record, resolved.filters)
}

function stripScope(filters: Record<string, unknown> | undefined) {
  if (!filters) return undefined
  const rest = { ...filters }
  delete rest.$scope
  return rest
}
