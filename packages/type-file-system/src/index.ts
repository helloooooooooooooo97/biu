export { isAssetFileName, assetNameFromUrl, assetNamesFromMarkdown, assetNamesFromHtml, collectAssetNames, collectAssetNamesLoose, registerBlockAssets, lookupBlockAssets, assetNamesFromBlock } from './asset-ref.ts'
export type { BlockAssetsDecl } from './asset-ref.ts'

/** 列类型：登记时声明，Core-File System 按类型渲染。string[] 视为 multi-select。 */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multi-select'
  | 'datetime'
  | 'url'
  | 'image'
  | 'attachment'
  | 'file'
  | 'string[]'
  | 'facet'
  | 'action'
  | 'person'
  | 'ref'
  | 'multi-ref'

export type FieldSpec = {
  type: FieldType
  label?: string
  writable?: boolean
  sortable?: boolean
  format?: 'datetime' | 'url' | 'image' | 'attachment' | 'file'
  /** select / multi-select 的选项 */
  enum?: string[]
  /** 给 Agent / db_stat：这个字段怎么写。不进单元格 UI。 */
  description?: string
  /** action 字段绑定的动作 id，缺省为字段 key */
  action?: string
  /** 由 list/get 计算写入记录，不能 PATCH。例如任务消耗。 */
  computed?: boolean
  /** person：创建人一人；编辑人可多人。 */
  multiple?: boolean
  /** ref / multi-ref 指向的表路径，缺省为本表。 */
  collection?: string
}

export type AttachmentValue = { name: string; href: string; bytes?: number }

export type PersonKind = 'user' | 'agent' | 'system'

export type PersonValue = {
  kind: PersonKind
  name: string
  sessionId?: string
  mascot?: { shape: string; color: string; eye?: number }
}

function personMascot(raw: unknown): PersonValue['mascot'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const rec = raw as { shape?: unknown; color?: unknown; eye?: unknown }
  if (typeof rec.shape !== 'string' || typeof rec.color !== 'string') return undefined
  return {
    shape: rec.shape,
    color: rec.color,
    ...(typeof rec.eye === 'number' ? { eye: rec.eye } : {}),
  }
}

export function asPerson(value: unknown): PersonValue | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    if (text === 'user' || text === '用户') return { kind: 'user', name: '用户' }
    if (text === 'system' || text === '系统') return { kind: 'system', name: '系统' }
    return { kind: 'agent', name: text, sessionId: text }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const sessionId = String(rec.sessionId ?? rec.id ?? '').trim()
  const kind: PersonKind =
    rec.kind === 'system' || rec.kind === 'agent' || rec.kind === 'user'
      ? rec.kind
      : sessionId
        ? 'agent'
        : 'user'
  const name =
    String(rec.name ?? rec.title ?? '').trim() ||
    (kind === 'system' ? '系统' : kind === 'user' ? '用户' : sessionId.slice(0, 8) || '')
  if (!name && !sessionId) return null
  const mascot = personMascot(rec.mascot)
  return { kind, name: name || 'Agent', ...(sessionId ? { sessionId } : {}), ...(mascot ? { mascot } : {}) }
}

export function personKey(person: PersonValue | null | undefined): string {
  if (!person) return ''
  if (person.kind === 'user') return 'user'
  if (person.kind === 'system') return 'system'
  return person.sessionId || person.name
}

export function asPersonList(value: unknown): PersonValue[] {
  if (value == null || value === '') return []
  if (Array.isArray(value)) {
    const out: PersonValue[] = []
    const seen = new Set<string>()
    for (const item of value) {
      const person = asPerson(item)
      const key = personKey(person)
      if (!person || !key || seen.has(key)) continue
      seen.add(key)
      out.push(person)
    }
    return out
  }
  const one = asPerson(value)
  return one ? [one] : []
}

export function appendPerson(existing: unknown, actor: PersonValue | null | undefined): PersonValue[] {
  const next = asPersonList(existing)
  if (!actor) return next
  const key = personKey(actor)
  if (!key) return next
  const idx = next.findIndex((item) => personKey(item) === key)
  if (idx < 0) next.push(actor)
  else next[idx] = actor
  return next
}

export function commitPersons(list: PersonValue[]): unknown {
  if (!list.length) return null
  if (list.length === 1) return list[0]
  return list
}

function hrefFromRecord(value: Record<string, unknown>) {
  return value.href ?? value.url ?? value.src
}

/** http(s) 链接；对象取 href / url。其它协议（javascript: 等）一律空。 */
export function asHttpHref(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return asHttpHref(hrefFromRecord(value as Record<string, unknown>))
  }
  const text = String(value ?? '').trim()
  return /^https?:\/\//i.test(text) ? text : ''
}

const SAME_ORIGIN_IMAGE = /^\/(?!\/)[^\s]*\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#][^\s]*)?$/i

/** 图片地址：http(s)、data:image，或同源相对路径（如 /page-covers/red.svg）。数组取第一张。 */
export function asImageSrc(value: unknown): string {
  if (Array.isArray(value)) return asImageSrc(value[0])
  if (value && typeof value === 'object') {
    return asImageSrc(hrefFromRecord(value as Record<string, unknown>))
  }
  const text = String(value ?? '').trim()
  if (/^https?:\/\//i.test(text)) return text
  if (/^data:image\//i.test(text)) return text
  if (SAME_ORIGIN_IMAGE.test(text)) return text
  return ''
}

/** 图片字段可存多张；单字符串仍当一张。非法地址丢掉。 */
export function asImageSrcList(value: unknown): string[] {
  if (value == null || value === '') return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) return asImageSrcList(parsed)
      } catch {
        /* one path */
      }
    }
  }
  if (Array.isArray(value)) {
    const out: string[] = []
    for (const item of value) {
      const src = asImageSrc(item)
      if (src) out.push(src)
    }
    return out
  }
  const src = asImageSrc(value)
  return src ? [src] : []
}

function asLocalHref(text: string) {
  const value = text.trim()
  if (/^https?:\/\//i.test(value)) return value
  if (/^\/(?!\/)[^\s]+$/.test(value)) return value
  if (/^(?:(?:\.page|\.biu\/page)\/)?assets\/[^\s/]+$/.test(value)) return value
  return ''
}

export function asAttachment(value: unknown): AttachmentValue | null {
  if (value == null || value === '') return null
  if (Array.isArray(value)) return asAttachment(value[0])
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    const href = asLocalHref(String(rec.href ?? rec.url ?? ''))
    if (!href) return null
    const name = String(rec.name ?? rec.filename ?? '').trim()
    const bytes = Number(rec.bytes)
    return {
      name: name || href.split('/').filter(Boolean).pop() || href,
      href,
      ...(Number.isFinite(bytes) && bytes > 0 ? { bytes } : {}),
    }
  }
  const href = asLocalHref(String(value ?? ''))
  if (!href) return null
  return { name: href.split('/').filter(Boolean).pop() || href, href }
}

/** 附件字段可存多个；单对象仍当一个。非法地址丢掉。 */
export function asAttachmentList(value: unknown): AttachmentValue[] {
  if (value == null || value === '') return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) return asAttachmentList(parsed)
      } catch {
        /* one path */
      }
    }
    const one = asAttachment(trimmed)
    return one ? [one] : []
  }
  if (Array.isArray(value)) {
    const out: AttachmentValue[] = []
    for (const item of value) {
      const file = asAttachment(item)
      if (file) out.push(file)
    }
    return out
  }
  const one = asAttachment(value)
  return one ? [one] : []
}

export function commitAttachments(list: AttachmentValue[]): unknown {
  if (!list.length) return ''
  if (list.length === 1) return list[0]
  return list
}

/** 每张表都有。id / 时间列默认不可写，表格默认不展开 id 与时间列。标题列始终存在。 */
export const BUILTIN_FIELDS = {
  id: { type: 'string', label: 'ID' },
  title: { type: 'string', label: '标题', writable: true },
  createdAt: { type: 'datetime', label: '创建时间' },
  updatedAt: { type: 'datetime', label: '更新时间' },
  content: { type: 'file', label: '内容' },
  emoji: { type: 'string', label: '图标', writable: true },
  tags: { type: 'multi-select', label: '标签', writable: true },
  facet: {
    type: 'facet',
    label: '合集',
    writable: true,
    description:
      '贴合集并填属性。一个合集：{tags:["facet-2"],values:{导演:"查泽雷"}}。多个合集 values 必须按 id 分组：{tags:["facet-2","awards"],values:{"facet-2":{导演:"查泽雷"},awards:{oscar:true}}}。省略 tags 只合并属性，不撕掉其它合集。',
  },
  parentId: { type: 'ref', label: '父级', writable: true },
  dependsOn: { type: 'multi-ref', label: '依赖', writable: true },
  createdBy: { type: 'person', label: '创建人', writable: false },
  updatedBy: { type: 'person', label: '编辑人', writable: false, multiple: true },
} as const satisfies Record<string, FieldSpec>

/** 登记 CollectionSpec.schema.fields 必须声明的记录列。由登记方自己存；创建人/编辑人也可由 Core 叠一层。 */
export const REQUIRED_RECORD_FIELD_KEYS = [
  'createdAt',
  'updatedAt',
  'emoji',
  'tags',
  'facet',
  'parentId',
  'dependsOn',
  'createdBy',
  'updatedBy',
] as const

export type RequiredRecordFieldKey = (typeof REQUIRED_RECORD_FIELD_KEYS)[number]

export type RequiredRecordFields = { [K in RequiredRecordFieldKey]: FieldSpec }

export type CollectionFields = RequiredRecordFields & Record<string, FieldSpec>

export const REQUIRED_RECORD_FIELDS: RequiredRecordFields = {
  createdAt: BUILTIN_FIELDS.createdAt,
  updatedAt: BUILTIN_FIELDS.updatedAt,
  emoji: BUILTIN_FIELDS.emoji,
  tags: BUILTIN_FIELDS.tags,
  facet: BUILTIN_FIELDS.facet,
  parentId: BUILTIN_FIELDS.parentId,
  dependsOn: BUILTIN_FIELDS.dependsOn,
  createdBy: BUILTIN_FIELDS.createdBy,
  updatedBy: BUILTIN_FIELDS.updatedBy,
}

/** 表格默认不展开这些内置列（标题除外）。分面作为默认业务列留下。 */
export const BUILTIN_FIELD_KEYS = ['id', 'createdAt', 'updatedAt', 'content', 'emoji', 'parentId', 'dependsOn', 'createdBy', 'updatedBy'] as const

export const RESERVED_SCHEMA_FIELD_KEYS = Object.keys(BUILTIN_FIELDS)

export function isReservedSchemaFieldKey(key: string) {
  return Object.prototype.hasOwnProperty.call(BUILTIN_FIELDS, String(key ?? '').trim())
}

export function isReservedSchemaFieldLabel(label: string) {
  const want = String(label ?? '').trim().toLowerCase()
  if (!want) return false
  if (isReservedSchemaFieldKey(want)) return true
  return Object.values(BUILTIN_FIELDS).some((field) => String(field.label ?? '').trim().toLowerCase() === want)
}

/** 分面包内允许的字段类型，含合集（可再贴合集）。 */
export const ATOMIC_FIELD_TYPES = [
  'string',
  'number',
  'boolean',
  'select',
  'multi-select',
  'datetime',
  'url',
  'image',
  'attachment',
  'file',
  'action',
  'facet',
  'person',
  'ref',
  'multi-ref',
] as const satisfies readonly FieldType[]

export function isFacetFieldType(type: unknown): boolean {
  return type === 'facet'
}

export function isRefFieldType(type: unknown): type is 'ref' | 'multi-ref' {
  return type === 'ref' || type === 'multi-ref'
}

export type AtomicFieldType = (typeof ATOMIC_FIELD_TYPES)[number]

export function isAtomicFieldType(type: unknown): type is AtomicFieldType {
  return typeof type === 'string' && (ATOMIC_FIELD_TYPES as readonly string[]).includes(type)
}

export type SchemaPackField = FieldSpec & {
  key: string
  type: AtomicFieldType
}

export type CollectionSchemaPack = {
  id: string
  label: string
  fields: SchemaPackField[]
}

export function normalizeSchemaPack(raw: unknown): CollectionSchemaPack | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const id = String(rec.id ?? '').trim()
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(id)) return null
  const label = String(rec.label ?? id).trim() || id
  const fields: SchemaPackField[] = []
  const seen = new Set<string>()
  const seenLabels = new Set<string>()
  const listed = Array.isArray(rec.fields) ? rec.fields : []
  for (const item of listed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const key = String(row.key ?? '').trim()
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || seen.has(key) || isReservedSchemaFieldKey(key)) continue
    if (!isAtomicFieldType(row.type)) continue
    const fieldLabel = String(row.label ?? key).trim() || key
    if (isReservedSchemaFieldLabel(fieldLabel) || seenLabels.has(fieldLabel.toLowerCase())) continue
    seen.add(key)
    seenLabels.add(fieldLabel.toLowerCase())
    const field: SchemaPackField = {
      key,
      type: row.type,
      label: fieldLabel,
      writable: row.writable !== false,
    }
    if (Array.isArray(row.enum)) field.enum = row.enum.map((option) => String(option)).filter(Boolean)
    fields.push(field)
  }
  return { id, label, fields }
}

export type SchemaFieldValue = {
  tags: string[]
  values: Record<string, Record<string, unknown>>
}

export function emptySchemaValue(): SchemaFieldValue {
  return { tags: [], values: {} }
}

export function isEmptySchemaValue(value: SchemaFieldValue): boolean {
  if (value.tags.length) return false
  for (const bag of Object.values(value.values)) {
    if (bag && typeof bag === 'object' && !Array.isArray(bag) && Object.keys(bag).length) return false
  }
  return true
}

/** 只保留仍贴着的合集下的值；从页面拿掉合集时元数据一起丢掉。 */
export function bindSchemaValue(
  tags: string[],
  values: SchemaFieldValue['values'] = {},
): SchemaFieldValue {
  const nextTags = [...new Set(tags.map((item) => String(item).trim()).filter(Boolean))]
  const next: SchemaFieldValue['values'] = {}
  for (const id of nextTags) {
    const bag = values[id]
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue
    next[id] = { ...bag }
  }
  return { tags: nextTags, values: next }
}

/** 仍贴着的合集保留原值；新贴上的合集从空开始。 */
export function retagSchemaValue(prev: SchemaFieldValue, nextTags: string[]): SchemaFieldValue {
  const attached = new Set(prev.tags)
  const carried: SchemaFieldValue['values'] = {}
  for (const id of nextTags) {
    const want = String(id).trim()
    if (!want || !attached.has(want)) continue
    const bag = prev.values[want]
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue
    carried[want] = bag
  }
  return bindSchemaValue(nextTags, carried)
}

export function normalizeSchemaValue(raw: unknown): SchemaFieldValue {
  if (raw == null || raw === '') return emptySchemaValue()
  if (typeof raw === 'string') {
    try {
      return normalizeSchemaValue(JSON.parse(raw) as unknown)
    } catch {
      return emptySchemaValue()
    }
  }
  if (Array.isArray(raw)) {
    return bindSchemaValue(raw.map((item) => String(item).trim()))
  }
  if (typeof raw !== 'object') return emptySchemaValue()
  const rec = raw as Record<string, unknown>
  const tags = Array.isArray(rec.tags)
    ? rec.tags.map((item) => String(item).trim())
    : []
  const values: SchemaFieldValue['values'] = {}
  if (rec.values && typeof rec.values === 'object' && !Array.isArray(rec.values)) {
    for (const [key, item] of Object.entries(rec.values as Record<string, unknown>)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      values[key] = { ...(item as Record<string, unknown>) }
    }
  }
  return bindSchemaValue(tags, values)
}

export function recordBuiltinValues(row: Record<string, unknown> = {}) {
  const createdAt = Number(row.createdAt)
  const updatedAt = Number(row.updatedAt)
  const created = Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0
  const updated = Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : created
  const tags = Array.isArray(row.tags)
    ? [...new Set(row.tags.map((item) => String(item).trim()).filter(Boolean))]
    : []
  const dependsOn = Array.isArray(row.dependsOn)
    ? [...new Set(row.dependsOn.map((item) => String(item).trim()).filter(Boolean))]
    : []
  const parentId = row.parentId == null || row.parentId === '' ? '' : String(row.parentId)
  return {
    createdAt: created,
    updatedAt: updated,
    emoji: String(row.emoji ?? ''),
    tags,
    facet: normalizeSchemaValue(row.facet),
    parentId,
    dependsOn,
    createdBy: asPerson(row.createdBy),
    updatedBy: commitPersons(asPersonList(row.updatedBy)),
  }
}

/** 全文检索：Tag id、显示名、以及包内已填的值。 */
export function schemaSearchHaystack(raw: unknown, packs: CollectionSchemaPack[] = []): string {
  const parsed = normalizeSchemaValue(raw)
  const labelOf = (id: string) => packs.find((pack) => pack.id === id)?.label ?? id
  const parts: string[] = []
  for (const id of parsed.tags) {
    parts.push(id, labelOf(id))
  }
  for (const [tagId, bag] of Object.entries(parsed.values)) {
    parts.push(tagId, labelOf(tagId))
    for (const [key, item] of Object.entries(bag)) {
      parts.push(key)
      if (item == null || item === '') continue
      if (Array.isArray(item)) parts.push(...item.map(String))
      else if (typeof item === 'object') parts.push(JSON.stringify(item))
      else parts.push(String(item))
    }
  }
  return parts.join(' ')
}

export function withBuiltinFields(
  fields: Record<string, FieldSpec>,
  contentField = 'content',
  labelField = 'title',
): CollectionFields {
  const next = { ...fields }
  next.id = { ...BUILTIN_FIELDS.id, ...next.id, writable: false }
  if (!next[labelField]) next[labelField] = { ...BUILTIN_FIELDS.title, label: labelField === 'title' ? '标题' : labelField }
  if (!next.createdAt) next.createdAt = BUILTIN_FIELDS.createdAt
  if (!next.updatedAt) next.updatedAt = BUILTIN_FIELDS.updatedAt
  if (!next.emoji) next.emoji = BUILTIN_FIELDS.emoji
  else if (!next.emoji.computed) next.emoji = { ...BUILTIN_FIELDS.emoji, ...next.emoji, writable: true }
  if (!next.tags) next.tags = BUILTIN_FIELDS.tags
  else if (!next.tags.computed) next.tags = { ...BUILTIN_FIELDS.tags, ...next.tags, type: 'multi-select', writable: true }
  if (!next.facet) next.facet = BUILTIN_FIELDS.facet
  if (!next.parentId) next.parentId = BUILTIN_FIELDS.parentId
  else if (!next.parentId.computed) next.parentId = { ...BUILTIN_FIELDS.parentId, ...next.parentId, type: 'ref', writable: true }
  if (!next.dependsOn) next.dependsOn = BUILTIN_FIELDS.dependsOn
  else if (!next.dependsOn.computed) next.dependsOn = { ...BUILTIN_FIELDS.dependsOn, ...next.dependsOn, type: 'multi-ref', writable: true }
  if (!next.createdBy) next.createdBy = BUILTIN_FIELDS.createdBy
  else next.createdBy = { ...BUILTIN_FIELDS.createdBy, ...next.createdBy, type: 'person', writable: false }
  if (!next.updatedBy) next.updatedBy = BUILTIN_FIELDS.updatedBy
  else next.updatedBy = { ...BUILTIN_FIELDS.updatedBy, ...next.updatedBy, type: 'person', writable: false, multiple: true }
  if (contentField === 'content' && !next.content) next.content = BUILTIN_FIELDS.content
  const ordered: Record<string, FieldSpec> = {
    id: next.id,
    [labelField]: next[labelField]!,
  }
  for (const [key, field] of Object.entries(next)) {
    if (key === 'id' || key === labelField) continue
    ordered[key] = field
  }
  return ordered as CollectionFields
}

/** 登记方可序列化的动作声明。图标与按钮长什么样由前端 decorate，不进这份契约。 */
export type CollectionActionAudience = 'both' | 'agent' | 'user'

export type CollectionActionInfo = {
  id: string
  label: string
  /** 给 Agent 看：这个动作何时用、args 怎么填、不要用错成别的动作。db_stat schema.actions 会带上。 */
  description?: string
  tone?: 'danger'
  /** 谁能用。缺省 both。前端只画 user 与 both。 */
  for?: CollectionActionAudience
  placement?: Array<'row' | 'detail'>
  confirm?: string
  /** 记录字段等值时才显示，例如 { enabled: false } */
  when?: Record<string, unknown>
  /** 给 db_action 的 args；不进按钮 UI。 */
  parameters?: Record<string, unknown>
  /** 记录还不存在时也能跑（例如新建插件）。 */
  allowMissing?: boolean
}

export function actionVisibleToUser(action: { for?: CollectionActionAudience }) {
  const audience = action.for ?? 'both'
  return audience === 'both' || audience === 'user'
}

export type CollectionSchema = {
  /** 标题列。缺省为 `title`；Core-File System 会补上该字段，且界面不可隐藏。 */
  labelField?: string
  /** 记录正文：真正存的文件内容。默认 `content`。结构由登记方自定。 */
  contentField?: string
  /** 正文后端：sqlite 旁表 / 文件 / 只读投影。 */
  contentBackend?: 'editorContent' | 'file' | 'computed'
  /** 必须包含图标、创建/更新时间、分面、父级、依赖、创建人/编辑人；登记方自己持久化。 */
  fields: CollectionFields
  /** 表格默认可见列（须为 fields 的键）。不写则列出全部列表列。详情仍显示全部字段。 */
  columns?: string[]
  /** 指向本表另一条记录 id 的字段。有则表格可按树展示；不写则按 parentId / parent 或数据里的父子引用推断。 */
  parentField?: string
  actions?: CollectionActionInfo[]
  /** 记录权限，来自登记时的 records。list/get 始终有；update/create/delete 缺省为 false。 */
  records?: CollectionRecordCaps
}

/** 登记时显式声明。list / get 是表的基本能力；update / create 是改已有行和新建行，不要再用 write。 */
export type CollectionRecordCaps = {
  update?: boolean
  create?: boolean
  delete?: boolean
}

export type DbRecord = { id: string } & Record<string, unknown>

export type CollectionAction = CollectionActionInfo & {
  run: (id: string, record: DbRecord, args?: Record<string, unknown>) => unknown | Promise<unknown>
}

/** 登记方自己选定的前端导航：路由、图标、显示名。Core-File System 按此在 Dock 挂入口，不代为生成路由。 */
export type CollectionView = {
  moduleId: string
  /** 调用方选定的前端路由，例如 /tasks；不得与已有导航冲突。 */
  route: string
  title?: string
  /** 给 Agent 看的表说明书：这张表是什么、用哪条 db_*、下一步常见动作、不要做什么。会出现在 db_list / 的 items[].view.blurb。 */
  blurb?: string
  order?: number
  /** 导航图标名（实现侧映射），例如 clipboard-document-list、puzzle-piece、document。 */
  icon?: string
  /** 登记后出现在 Session 检查器加号里，用 title 作为「添加××」。 */
  inspector?: boolean
}

export type CollectionListQuery = {
  /** 只取这些 id。File System 在分面筛选时传入，避免整表 list。 */
  ids?: string[]
  q?: string
  filter?: Record<string, unknown>
}

export function hasCollectionDeleteQuery(query?: CollectionListQuery | null): boolean {
  if (!query) return false
  if (Array.isArray(query.ids) && query.ids.some((id) => String(id).trim())) return true
  if (String(query.q ?? '').trim()) return true
  if (query.filter && Object.keys(query.filter).some((key) => query.filter?.[key] != null && query.filter[key] !== '')) {
    return true
  }
  return false
}

export type CollectionSpec = {
  id: string
  path: string
  label?: string
  schema: CollectionSchema
  view?: CollectionView
  /**
   * 记录权限。list / get 始终可用。
   * update / create / delete 为 true 时必须提供对应实现；不写则不能改、不能新建、不能删。
   */
  records?: CollectionRecordCaps
  /** 可接收查询；不认 ids 时 File System 仍会在内存里收窄。 */
  list: (query?: CollectionListQuery) => DbRecord[] | Promise<DbRecord[]>
  get: (id: string) => DbRecord | null | undefined | Promise<DbRecord | null | undefined>
  /** 更新已有记录的可写字段。不要叫 write。 */
  update?: (id: string, patch: Record<string, unknown>) => DbRecord | Promise<DbRecord>
  create?: (rows: Record<string, unknown>[]) => DbRecord[] | Promise<DbRecord[]>
  remove?: (query: CollectionListQuery) => string[] | void | boolean | Promise<string[] | void | boolean>
  actions?: CollectionAction[]
}

export type CollectionInfo = {
  id: string
  path: string
  kind: 'collection'
  label: string
  view: CollectionView | null
}

export const DATABASE_CHANNEL = 'database' as const
export const CONTENT_JUMP_EVENT = 'biu:content-jump' as const

export type ContentJump = {
  path: string
  start_line: number
  end_line: number
  text?: string
  navigate?: boolean
}

export function parseContentJump(raw: unknown): ContentJump | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as { path?: unknown; start_line?: unknown; end_line?: unknown; text?: unknown; navigate?: unknown }
  const start = Number(rec.start_line)
  if (!Number.isInteger(start) || start < 1) return null
  const endRaw = Number(rec.end_line)
  const end = Number.isInteger(endRaw) && endRaw >= start ? endRaw : start
  const text = typeof rec.text === 'string' ? rec.text.trim() : ''
  return {
    path: String(rec.path ?? ''),
    start_line: start,
    end_line: end,
    ...(text ? { text } : {}),
    ...(rec.navigate === true ? { navigate: true } : {}),
  }
}

export type ListPage = {
  q?: string
  sortField?: string
  sortDir?: 'asc' | 'desc'
  /** 缺省 50，最大 200；列表接口不会一次返回整表。 */
  limit?: number
  offset?: number
  /** 多列排序；有值时优先于 sortField/sortDir。 */
  sorts?: Array<{ field: string; dir: 'asc' | 'desc' }>
  /** 只返回这些列；空或不传则除 content 外全返回。id 始终带上。 */
  columns?: string[]
}

/** File System 实现必须满足的服务面。换实现时只要还叫 ctx.database 并遵守这套方法。 */
export interface Database {
  register(spec: CollectionSpec): unknown
  list(path: string, filter?: Record<string, unknown>, page?: ListPage): Promise<unknown>
  read(path: string): Promise<unknown>
  update(path: string, content: unknown): Promise<unknown>
  create(path: string, records: unknown): Promise<unknown>
  remove(path: string, query: CollectionListQuery): Promise<unknown>
  action(path: string, actionId: string, args?: Record<string, unknown>): Promise<unknown>
  stat(path: string): Promise<unknown>
  /** 单独读写记录正文（content 字段），不走 list/read。 */
  content(path: string): Promise<unknown>
  writeContent(path: string, value: unknown): Promise<unknown>
}

declare module 'cordis' {
  interface Context {
    database: Database
  }
  interface Events {
    'database/change'(): void
  }
}
