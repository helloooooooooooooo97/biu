/** 与 @biu/core-pick 的 data-biu-* 句柄对齐，Core 不依赖 pick 包。 */
export type PickDomExtra = {
  action?: string
  path?: string
  title?: string
  text?: string
  field?: string
}

export function pickDomAttrs(kind: string, id: string, label?: string, extra?: PickDomExtra) {
  const text = extra?.text?.trim()
  return {
    'data-biu-kind': kind,
    'data-biu-id': id,
    ...(label ? { 'data-biu-label': label } : {}),
    ...(extra?.action ? { 'data-biu-action': extra.action } : {}),
    ...(extra?.path ? { 'data-biu-path': extra.path } : {}),
    ...(extra?.title ? { 'data-biu-title': extra.title } : {}),
    ...(text ? { 'data-biu-text': text } : {}),
    ...(extra?.field ? { 'data-biu-field': extra.field } : {}),
  }
}

export function recordSourcePath(collectionPath: string | undefined, recordId: string) {
  const base = String(collectionPath ?? '').trim()
  const id = String(recordId ?? '').trim()
  if (!base || !id) return ''
  const path = base.startsWith('/') ? base : `/${base}`
  return `${path.replace(/\/$/, '')}/${id}`
}

export function fieldPickId(recordId: string, field: string) {
  return `${recordId}:${field}`
}

export function fieldPickAttrs(
  kind: string,
  recordId: string,
  field: string,
  opts: { label?: string; title?: string; path?: string; text?: string },
) {
  const path = opts.path || ''
  const title = opts.title?.trim() || ''
  const label = opts.label?.trim() || field
  return pickDomAttrs(kind, fieldPickId(recordId, field), label, {
    ...(path ? { path } : {}),
    ...(title ? { title } : {}),
    field,
    ...(opts.text?.trim() ? { text: opts.text.trim() } : {}),
  })
}

/** 登记 moduleId / 表 id 对到 CAP 芯片用的 kind（单数、和 icon 表一致）。 */
const RECORD_PICK_KIND: Record<string, string> = {
  tasks: 'task',
  task: 'task',
  page: 'page',
  pages: 'page',
  plugins: 'plugin',
  plugin: 'plugin',
  sessions: 'session',
  session: 'session',
  'sessions-db': 'session',
  events: 'event',
  event: 'event',
  'events-db': 'event',
  views: 'view',
  view: 'view',
  'views-db': 'view',
  facets: 'facet',
  facet: 'facet',
  'facets-db': 'facet',
}

export function recordPickKind(moduleId?: string | null) {
  const kind = String(moduleId ?? '').trim()
  if (!kind) return 'record'
  return RECORD_PICK_KIND[kind] ?? kind.replace(/-db$/, '')
}

export function viewPickId(path: string, viewId: string) {
  return `${path}::${viewId}`
}
