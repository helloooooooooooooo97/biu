import type { CollectionSchema, CollectionSchemaPack, DbRecord, FieldType } from '@biu/type-file-system'
import { isFacetFieldType, normalizeSchemaValue } from '@biu/type-file-system'

export type SortRule = { id: string; field: string; dir: 'asc' | 'desc' }

export type FilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_empty' | 'not_empty' | 'gt' | 'lt' | 'within'

export type FilterRule = { kind: 'rule'; id: string; field: string; op: FilterOp; value: string }
export type FilterGroup = { kind: 'group'; id: string; combinator: 'and' | 'or'; children: FilterNode[] }
export type FilterNode = FilterRule | FilterGroup

let seq = 0
export function queryNodeId(prefix: string) {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

export function emptyFilterGroup(): FilterGroup {
  return { kind: 'group', id: queryNodeId('g'), combinator: 'and', children: [] }
}

export function emptyFilterRule(field = 'title'): FilterRule {
  return { kind: 'rule', id: queryNodeId('r'), field, op: 'contains', value: '' }
}

export function emptySortRule(field = 'title'): SortRule {
  return { id: queryNodeId('s'), field, dir: 'asc' }
}

export function moveList<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = items.slice()
  const [item] = next.splice(from, 1)
  if (!item) return items
  next.splice(to, 0, item)
  return next
}

export function normalizeSorts(raw: unknown, sortField = 'title', sortDir: 'asc' | 'desc' = 'asc'): SortRule[] {
  if (Array.isArray(raw)) {
    const out: SortRule[] = []
    const seen = new Set<string>()
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const rec = item as Record<string, unknown>
      const field = String(rec.field ?? '').trim()
      if (!field || seen.has(field)) continue
      seen.add(field)
      out.push({
        id: String(rec.id ?? '').trim() || queryNodeId('s'),
        field,
        dir: rec.dir === 'desc' ? 'desc' : 'asc',
      })
    }
    if (out.length) return out
    if (Array.isArray(raw)) return out
  }
  const field = String(sortField || 'title').trim() || 'title'
  return [{ id: queryNodeId('s'), field, dir: sortDir === 'desc' ? 'desc' : 'asc' }]
}

export function normalizeFilterGroup(raw: unknown): FilterGroup {
  const node = normalizeFilterNode(raw)
  if (node?.kind === 'group') return node
  return emptyFilterGroup()
}

function normalizeFilterNode(raw: unknown): FilterNode | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (rec.kind === 'rule' || rec.field) {
    const field = String(rec.field ?? '').trim()
    if (!field) return null
    const op = asFilterOp(rec.op) ?? 'eq'
    return {
      kind: 'rule',
      id: String(rec.id ?? '').trim() || queryNodeId('r'),
      field,
      op,
      value: rec.value == null ? '' : String(rec.value),
    }
  }
  const children = Array.isArray(rec.children)
    ? rec.children.map((item) => normalizeFilterNode(item)).filter((item): item is FilterNode => Boolean(item))
    : []
  return {
    kind: 'group',
    id: String(rec.id ?? '').trim() || queryNodeId('g'),
    combinator: rec.combinator === 'or' ? 'or' : 'and',
    children,
  }
}

function asFilterOp(value: unknown): FilterOp | null {
  if (
    value === 'eq' ||
    value === 'neq' ||
    value === 'contains' ||
    value === 'not_contains' ||
    value === 'is_empty' ||
    value === 'not_empty' ||
    value === 'gt' ||
    value === 'lt' ||
    value === 'within'
  ) {
    return value
  }
  return null
}

export function flatFiltersToTree(filters: Record<string, string> | undefined): FilterGroup {
  const group = emptyFilterGroup()
  if (!filters) return group
  for (const [key, value] of Object.entries(filters)) {
    if (!key || key.startsWith('$') || value == null || value === '') continue
    group.children.push({
      kind: 'rule',
      id: queryNodeId('r'),
      field: key,
      op: 'eq',
      value: String(value),
    })
  }
  return group
}

export function countFilterRules(node: FilterNode | undefined): number {
  if (!node) return 0
  if (node.kind === 'rule') return node.op === 'is_empty' || node.op === 'not_empty' || String(node.value).trim() ? 1 : 0
  return node.children.reduce((sum, child) => sum + countFilterRules(child), 0)
}

export function collectFilterFields(node: FilterNode | undefined, into = new Set<string>()): Set<string> {
  if (!node) return into
  if (node.kind === 'rule') {
    if (countFilterRules(node)) into.add(node.field)
    return into
  }
  for (const child of node.children) collectFilterFields(child, into)
  return into
}

export function isCustomSorts(
  sorts: Array<Pick<SortRule, 'field' | 'dir'>> | undefined,
  defaultField = 'title',
  defaultDir: 'asc' | 'desc' = 'asc',
) {
  if (!sorts?.length) return false
  if (sorts.length === 1 && sorts[0]?.field === defaultField && sorts[0]?.dir === defaultDir) return false
  return true
}

export function collectQueryFields(
  sorts: Array<Pick<SortRule, 'field' | 'dir'>> | undefined,
  tree?: FilterNode,
  defaultSortField = 'title',
): Set<string> {
  const keys = collectFilterFields(tree)
  if (!isCustomSorts(sorts, defaultSortField)) return keys
  for (const rule of sorts ?? []) {
    const field = String(rule.field ?? '').trim()
    if (field) keys.add(field)
  }
  return keys
}

function filterNodeState(node: FilterNode): unknown {
  if (node.kind === 'rule') return { kind: 'rule', field: node.field, op: node.op, value: node.value }
  return { kind: 'group', combinator: node.combinator, children: node.children.map(filterNodeState) }
}

/** 比较筛选树时丢掉随机 id，空树与缺省等价。 */
export function filterTreeStateKey(tree: FilterGroup | null | undefined): string {
  if (!tree || countFilterRules(tree) === 0) return '[]'
  return JSON.stringify(filterNodeState(normalizeFilterGroup(tree)))
}

export function sortsStateKey(sorts: Array<Pick<SortRule, 'field' | 'dir'>> | undefined): string {
  return JSON.stringify((sorts ?? []).map((item) => ({ field: item.field, dir: item.dir })))
}

export function opsForKind(kind: FieldType | string): Array<{ value: FilterOp; label: string }> {
  if (kind === 'datetime') {
    return [
      { value: 'within', label: '在此范围内' },
      { value: 'is_empty', label: '为空' },
      { value: 'not_empty', label: '不为空' },
    ]
  }
  if (kind === 'boolean') {
    return [
      { value: 'eq', label: '是' },
      { value: 'neq', label: '不是' },
      { value: 'is_empty', label: '为空' },
      { value: 'not_empty', label: '不为空' },
    ]
  }
  if (kind === 'number') {
    return [
      { value: 'eq', label: '等于' },
      { value: 'neq', label: '不等于' },
      { value: 'gt', label: '大于' },
      { value: 'lt', label: '小于' },
      { value: 'is_empty', label: '为空' },
      { value: 'not_empty', label: '不为空' },
    ]
  }
  if (kind === 'select' || kind === 'multi-select' || kind === 'facet') {
    return [
      { value: 'eq', label: '是' },
      { value: 'neq', label: '不是' },
      { value: 'is_empty', label: '为空' },
      { value: 'not_empty', label: '不为空' },
    ]
  }
  return [
    { value: 'contains', label: '包含' },
    { value: 'not_contains', label: '不包含' },
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
    { value: 'is_empty', label: '为空' },
    { value: 'not_empty', label: '不为空' },
  ]
}

export function sortDirLabel(kind: FieldType | string, dir: 'asc' | 'desc') {
  if (kind === 'number' || kind === 'datetime') return dir === 'asc' ? '升序' : '降序'
  if (kind === 'boolean') return dir === 'asc' ? '否 → 是' : '是 → 否'
  return dir === 'asc' ? 'A → Z' : 'Z → A'
}

export function defaultOpForKind(kind: FieldType | string): FilterOp {
  return opsForKind(kind)[0]?.value ?? 'contains'
}

function isEmptyValue(actual: unknown) {
  if (actual == null || actual === '') return true
  if (Array.isArray(actual)) return actual.length === 0
  if (typeof actual === 'boolean') return false
  if (typeof actual === 'object') {
    const parsed = normalizeSchemaValue(actual)
    if (parsed.tags.length) return false
  }
  return String(actual).trim() === ''
}

function asText(actual: unknown) {
  if (Array.isArray(actual)) return actual.map(String).join(' ')
  if (actual && typeof actual === 'object') {
    const rec = actual as Record<string, unknown>
    if (typeof rec.name === 'string' && rec.name.trim()) return rec.name
    if (typeof rec.label === 'string' && rec.label.trim()) return rec.label
    return ''
  }
  return String(actual ?? '')
}

export function matchFilterRule(
  record: DbRecord,
  rule: FilterRule,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  const actual = record[rule.field]
  const field = schema?.fields[rule.field]
  const want = rule.value
  if (rule.op === 'is_empty') return isEmptyValue(actual)
  if (rule.op === 'not_empty') return !isEmptyValue(actual)
  if (rule.op === 'eq' && ['1h', '24h', '7d', '30d'].includes(want) && (field?.type === 'datetime' || field?.format === 'datetime')) {
    return matchFilterRule(record, { ...rule, op: 'within' }, schema, packs)
  }
  if (rule.op === 'within') {
    const n = Number(actual)
    if (!Number.isFinite(n) || n <= 0) return false
    const span = want === '1h' ? 3600e3 : want === '24h' ? 86400e3 : want === '7d' ? 7 * 86400e3 : want === '30d' ? 30 * 86400e3 : 0
    if (!span) return false
    return Date.now() - n <= span
  }
  if (isFacetFieldType(field?.type)) {
    const parsed = normalizeSchemaValue(actual)
    const hit = parsed.tags.some((id) => id === want || packs.find((item) => item.id === id)?.label === want)
    if (rule.op === 'eq') return hit
    if (rule.op === 'neq') return !hit
  }
  if (Array.isArray(actual)) {
    const has = actual.map(String).includes(want)
    if (rule.op === 'eq') return has
    if (rule.op === 'neq') return !has
    if (rule.op === 'contains') return actual.some((item) => String(item).toLowerCase().includes(want.toLowerCase()))
    if (rule.op === 'not_contains') return !actual.some((item) => String(item).toLowerCase().includes(want.toLowerCase()))
  }
  if (field?.type === 'boolean') {
    const on = actual === true || actual === 'true' ? 'true' : 'false'
    if (rule.op === 'eq') return on === want
    if (rule.op === 'neq') return on !== want
  }
  const text = asText(actual)
  const left = text.toLowerCase()
  const right = want.toLowerCase()
  if (rule.op === 'contains') return left.includes(right)
  if (rule.op === 'not_contains') return !left.includes(right)
  if (rule.op === 'eq') return text === want
  if (rule.op === 'neq') return text !== want
  const an = Number(actual)
  const bn = Number(want)
  if (rule.op === 'gt') return Number.isFinite(an) && Number.isFinite(bn) && an > bn
  if (rule.op === 'lt') return Number.isFinite(an) && Number.isFinite(bn) && an < bn
  return String(actual ?? '') === want
}

export function matchFilterNode(
  record: DbRecord,
  node: FilterNode,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
): boolean {
  if (node.kind === 'rule') return matchFilterRule(record, node, schema, packs)
  const kids = node.children.filter((child) => {
    if (child.kind === 'group') return child.children.length > 0
    return child.op === 'is_empty' || child.op === 'not_empty' || String(child.value).trim() !== ''
  })
  if (!kids.length) return true
  if (node.combinator === 'or') return kids.some((child) => matchFilterNode(record, child, schema, packs))
  return kids.every((child) => matchFilterNode(record, child, schema, packs))
}

export function matchListFilterRecord(
  record: DbRecord,
  filter: Record<string, unknown> | undefined,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  if (!filter) return true
  const tree = filter.$tree
  for (const [key, expected] of Object.entries(filter)) {
    if (key === '$tree' || expected == null || expected === '') continue
    const pass = matchFilterRule(record, { kind: 'rule', id: key, field: key, op: 'eq', value: String(expected) }, schema, packs)
    if (!pass) return false
  }
  if (tree && typeof tree === 'object' && !Array.isArray(tree)) {
    return matchFilterNode(record, normalizeFilterGroup(tree), schema, packs)
  }
  return true
}

export function compareRecords(a: DbRecord, b: DbRecord, field: string, dir: 'asc' | 'desc') {
  const av = a[field]
  const bv = b[field]
  const an = Number(av)
  const bn = Number(bv)
  const numeric = Number.isFinite(an) && Number.isFinite(bn) && String(av).trim() !== '' && String(bv).trim() !== ''
  const c = numeric ? an - bn : String(av ?? '').localeCompare(String(bv ?? ''), 'zh')
  const sign = dir === 'desc' ? -1 : 1
  return c * sign
}

export function sortRecordsBy(rows: DbRecord[], sorts: SortRule[]) {
  const rules = sorts.filter((item) => item.field)
  if (!rules.length) return rows
  return [...rows].sort((a, b) => {
    for (const rule of rules) {
      const c = compareRecords(a, b, rule.field, rule.dir)
      if (c !== 0) return c
    }
    return String(a.id).localeCompare(String(b.id))
  })
}

export function looksLikeFilterTree(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const rec = raw as Record<string, unknown>
  return rec.kind === 'group' || rec.kind === 'rule' || Array.isArray(rec.children)
}

export const VIEW_FILTERS_DESCRIPTION =
  '扁平 JSON 字符串，各 key 等于该列。例 {"project":"biu","tags":"test"}。tags/多选是「包含该值」。AND 多个 key；OR 或 contains/neq 用 filterTree。'

export const VIEW_FILTER_TREE_DESCRIPTION =
  '筛选树 JSON。group: {kind:"group",combinator:"and"|"or",children}；rule: {kind:"rule",field,op,value}，value 为字符串，id 可省。op: eq|neq|contains|not_contains|is_empty|not_empty|gt|lt|within。标签含 test：{"kind":"group","combinator":"and","children":[{"kind":"rule","field":"tags","op":"eq","value":"test"}]}。两个标签任一：combinator or，两条 eq。'

export const VIEW_SORTS_DESCRIPTION =
  'JSON 数组，按顺序多 key 排序。例 [{"field":"project","dir":"asc"},{"field":"title","dir":"desc"}]。dir 仅 asc|desc。'

/** 有规则的 filterTree 优先；空树则回退扁平 filters（agent db_update 仍写 {project:"biu"}）。 */
export function resolveViewFilterTree(view: {
  builtin?: boolean
  filters?: Record<string, string>
  filterTree?: FilterGroup | null
}): FilterGroup {
  if (view.filterTree && countFilterRules(view.filterTree) > 0) return normalizeFilterGroup(view.filterTree)
  if (view.builtin) return emptyFilterGroup()
  return flatFiltersToTree(view.filters)
}

export function parseSortsInput(raw: unknown, sortField = 'title', sortDir: 'asc' | 'desc' = 'asc'): SortRule[] {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return normalizeSorts(JSON.parse(raw), sortField, sortDir)
    } catch {
      return normalizeSorts(undefined, sortField, sortDir)
    }
  }
  return normalizeSorts(raw, sortField, sortDir)
}

export function encodeListFilter(locks: Record<string, string>, tree: FilterGroup | undefined) {
  const out: Record<string, unknown> = { ...locks }
  if (tree && countFilterRules(tree)) out.$tree = tree
  return out
}
