import { readFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { isAbsolute, resolve } from 'node:path'
import { dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'
import { asPublicProfile, readWorkspaceProfile, writeWorkspaceProfile } from './workspace-profile.ts'
import { Service, type Context } from 'cordis'
import {
  DATABASE_CHANNEL,
  asAttachmentList,
  asPerson,
  asPersonList,
  appendPerson,
  asHttpHref,
  asImageSrc,
  asImageSrcList,
  isFacetFieldType,
  bindSchemaValue,
  emptySchemaValue,
  isEmptySchemaValue,
  normalizeSchemaValue,
  schemaSearchHaystack,
  withBuiltinFields,
  hasCollectionDeleteQuery,
  actionVisibleToUser,
  type CollectionAction,
  type CollectionActionInfo,
  type CollectionInfo,
  type CollectionListQuery,
  type CollectionSchema,
  type CollectionSchemaPack,
  type CollectionFields,
  type CollectionSpec,
  type Database,
  type DbRecord,
  type FieldSpec,
  type SchemaFieldValue,
  type ListPage,
  type PersonValue,
  parseContentJump,
} from '@biu/type-file-system'
import { parsePageBanner, type PageBanner } from '../page-banner.ts'
import { SavedViewsStore, clientViewFromDbRow, viewsCollection, type StoredView } from './saved-views.ts'
import { publicShareUrl } from './share-origin.ts'
import { readSharePluginWebJs, zipSharePluginSource } from './share-plugin-pack.ts'
import { collectShareResources } from '../share-resources.ts'
import { FacetStore } from './facets-store.ts'
import { SharesStore, dropSharesForRemovedViews } from './shares-store.ts'
import { displayNameForView, isReadOnlyViewId } from '../catalog-views.ts'
import { buildShareSnapshot } from './share-payload.ts'
import { FileSystemAssets, collectAssetNames, isAssetFileName, isHashedAssetName, mimeOfAsset } from './assets-store.ts'
import { facetsCollection } from './facets-collection.ts'
import { noticesCollection } from './notices-collection.ts'
import { NoticesService } from './notices-service.ts'
import { ContentTurnService } from './content-turn-service.ts'
import {
  asContentText,
  findReplaceText,
  insertText,
  replaceLinesText,
  resolveContentCommand,
  strReplaceText,
  viewContent,
  writeContentText,
  mutationLocus,
} from './content-edit.ts'
import { currentSessionId } from '@biu/host-sessions/scope'
import { databaseRevealForTool, normalizeCollectionPath } from '../paths.ts'
import { matchListFilterRecord, normalizeSorts, sortRecordsBy } from '../query-logic.ts'
import { AgentDbCompact } from './agent-payload.ts'

const agentDbCompact = new AgentDbCompact()

function publicAction(action: CollectionAction): CollectionActionInfo {
  const { run: _run, ...info } = action
  if (!actionVisibleToUser(info)) return { ...info, placement: [] }
  return info
}

const STAMP_FIELD_BLOCKLIST = new Set([
  'id',
  'title',
  'table',
  'tablePath',
  'sourceId',
  'facetId',
  'tag',
  'fieldCount',
  'stampCount',
  'facetId',
  'content',
  'emoji',
  'createdAt',
  'updatedAt',
])

function schemaWithTagPack(schema: CollectionSchema, pack: CollectionSchemaPack | null): CollectionSchema {
  if (!pack?.fields.length) {
    return {
      ...schema,
      columns: ['title', 'table'],
    }
  }
  const fields = { ...schema.fields }
  const extra: string[] = []
  for (const field of pack.fields) {
    if (STAMP_FIELD_BLOCKLIST.has(field.key)) continue
    fields[field.key] = {
      type: field.type,
      label: field.label ?? field.key,
      writable: false,
      computed: true,
      ...(field.enum ? { enum: field.enum } : {}),
    }
    extra.push(field.key)
  }
  return { ...schema, fields, columns: ['title', 'table', ...extra] }
}

function ensureColumn(columns: string[] | undefined, key: string) {
  if (!columns) return columns
  return columns.includes(key) ? columns : [...columns, key]
}

function schemaFor(spec: CollectionSpec): CollectionSchema {
  const contentField = spec.schema.contentField ?? 'content'
  const raw = withBuiltinFields(spec.schema.fields, contentField, 'title')
  const fields: CollectionFields = { ...raw }
  for (const [key, field] of Object.entries(raw)) {
    fields[key] = field.computed ? { ...field, writable: false } : field
  }
  return {
    ...spec.schema,
    labelField: 'title',
    contentField,
    fields,
    columns:
      ensureColumn(ensureColumn(spec.schema.columns, 'facet'), 'tags'),
    actions: (spec.actions ?? []).map(publicAction),
    records: {
      update: Boolean(spec.records?.update),
      create: Boolean(spec.records?.create),
      delete: Boolean(spec.records?.delete),
    },
  }
}

function assertRecordCaps(spec: CollectionSpec) {
  if (spec.records?.update && !spec.update) throw new Error(`collection ${spec.id}: records.update 为 true 时必须提供 update`)
  if (spec.records?.create && !spec.create) throw new Error(`collection ${spec.id}: records.create 为 true 时必须提供 create`)
  if (spec.records?.delete && !spec.remove) throw new Error(`collection ${spec.id}: records.delete 为 true 时必须提供 remove`)
  if (spec.create && !spec.records?.create) throw new Error(`collection ${spec.id}: 提供了 create 但未声明 records.create`)
  if (spec.remove && !spec.records?.delete) throw new Error(`collection ${spec.id}: 提供了 remove 但未声明 records.delete`)
}

function collectionCaps(spec: CollectionSpec) {
  return [
    'list',
    'read',
    spec.records?.update && spec.update ? 'update' : null,
    spec.records?.create && spec.create ? 'create' : null,
    spec.records?.delete && spec.remove ? 'delete' : null,
    spec.actions?.length ? 'action' : null,
    'content',
  ].filter(Boolean)
}

function contentKey(spec: CollectionSpec) {
  return schemaFor(spec).contentField ?? 'content'
}

function withoutContent(spec: CollectionSpec, row: DbRecord): DbRecord {
  const key = contentKey(spec)
  if (!Object.prototype.hasOwnProperty.call(row, key)) return row
  const field = schemaFor(spec).fields[key]
  if (field && field.type !== 'file') return row
  const next = { ...row }
  delete next[key]
  return next
}

function listedColumnKeys(requested: unknown, labelField: string): string[] | null {
  if (!Array.isArray(requested) || !requested.length) return null
  const keys: string[] = []
  const seen = new Set<string>()
  const add = (key: string) => {
    const next = key.trim()
    if (!next || seen.has(next)) return
    seen.add(next)
    keys.push(next)
  }
  add('id')
  for (const item of requested) {
    const raw = String(item ?? '').trim()
    if (!raw) continue
    add(raw === 'label' ? labelField : raw)
  }
  return keys
}

function pickListedFields(row: DbRecord, keys: string[]): DbRecord {
  const next: DbRecord = { id: row.id }
  for (const key of keys) {
    if (key === 'path' || key === 'kind') continue
    if (Object.prototype.hasOwnProperty.call(row, key)) next[key] = row[key]
  }
  return next
}

export function matchActionWhen(record: DbRecord, when?: Record<string, unknown>) {
  if (!when) return true
  for (const [key, expected] of Object.entries(when)) {
    const actual = record[key]
    if (expected === true || expected === false) {
      const flag = actual === true || actual === 'true'
      if (flag !== expected) return false
      continue
    }
    if (String(actual ?? '') !== String(expected)) return false
  }
  return true
}

function publicCollection(item: CollectionSpec): CollectionInfo {
  return {
    id: item.id,
    path: item.path,
    kind: 'collection',
    label: item.label ?? item.id,
    view: item.view ?? null,
  }
}

function splitPath(path: string): string[] {
  const normalized = normalizeCollectionPath(path)
  if (normalized === '/') return []
  const parts = normalized.slice(1).split('/').filter(Boolean)
  if (parts[0] === 'views' && parts.length > 2) {
    return ['views', parts.slice(1).join('/')]
  }
  return parts
}

function coerceList(value: unknown) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  throw new Error('expected string list')
}

function sessionTitleFromRow(row: unknown): string {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ''
  const rec = row as Record<string, unknown>
  const title = String(rec.title ?? rec.name ?? '').trim()
  if (title) return title
  const config = rec.config
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return String((config as { title?: unknown }).title ?? '').trim()
  }
  return ''
}

function coerceUrl(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const direct = asHttpHref(text)
  if (direct) return direct
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) throw new Error('expected url')
  const prefixed = asHttpHref(`https://${text}`)
  if (!prefixed) throw new Error('expected url')
  return prefixed
}

function coerce(field: FieldSpec, value: unknown) {
  const kind = field.type === 'string[]' ? 'multi-select' : field.format && field.type === 'string' ? field.format : field.type
  if (kind === 'boolean') return value === true || value === 'true'
  if (kind === 'multi-select') return coerceList(value)
  if (kind === 'number' || kind === 'datetime') {
    if (value == null || value === '') return null
    const n = Number(value)
    if (!Number.isFinite(n)) throw new Error(`expected ${kind}`)
    return n
  }
  if (kind === 'url') return coerceUrl(value)
  if (kind === 'person') {
    if (value == null || value === '') return null
    const person = asPerson(value)
    if (!person) throw new Error('expected person')
    return person
  }
  if (kind === 'ref') {
    if (value == null || value === '') return ''
    if (Array.isArray(value)) return String(value[0] ?? '').trim()
    return String(value).trim()
  }
  if (kind === 'multi-ref') {
    return [...new Set(coerceList(value).map((item) => item.trim()).filter(Boolean))]
  }
  if (kind === 'image') {
    if (value == null || value === '') return ''
    const list = asImageSrcList(value)
    if (!list.length) throw new Error('expected image')
    return list.length === 1 ? list[0] : list
  }
  if (kind === 'attachment') {
    if (value == null || value === '') return ''
    const list = asAttachmentList(value)
    if (!list.length) return ''
    return list.length === 1 ? list[0] : list
  }
  if (kind === 'file') {
    if (value == null) return null
    if (value === '') return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'object') return value
    throw new Error('expected file')
  }
  if (kind === 'action') return value == null ? '' : value
  if (isFacetFieldType(kind)) return normalizeSchemaValue(value)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>
    if (typeof rec.sessionId === 'string' || rec.kind === 'agent' || rec.kind === 'user') return value
    return JSON.stringify(value)
  }
  return String(value ?? '')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function packFieldKey(pack: CollectionSchemaPack | null | undefined, name: string) {
  const want = String(name ?? '').trim()
  if (!pack || !want) return want
  for (const field of pack.fields) {
    if (field.key === want || field.label === want) return field.key
  }
  return want
}

function remapFacetBag(pack: CollectionSchemaPack | null | undefined, bag: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(bag)) {
    const field = packFieldKey(pack, key)
    if (!field) continue
    if (value == null || value === '') {
      delete out[field]
      continue
    }
    out[field] = value
  }
  return out
}

/** Agent 常写成扁平 values（中文属性名），权威形状是 values[合集id][字段key]。 */
function coerceFacetPatch(
  raw: unknown,
  current: SchemaFieldValue,
  resolvePack: (idOrLabel: string) => CollectionSchemaPack | null,
): SchemaFieldValue {
  let parsed: unknown = raw
  if (typeof parsed === 'string' && parsed.trim()) {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      parsed = raw
    }
  }
  if (Array.isArray(parsed)) {
    const tags = parsed.map((item) => resolvePack(String(item))?.id ?? String(item).trim()).filter(Boolean)
    return bindSchemaValue(tags, current.values)
  }
  if (!isPlainObject(parsed)) return normalizeSchemaValue(parsed)
  const rec = parsed
  const rawTags = Array.isArray(rec.tags)
    ? rec.tags.map((item) => String(item).trim()).filter(Boolean)
    : rec.tags == null
      ? current.tags
      : []
  const tags = [...new Set(rawTags.map((item) => resolvePack(item)?.id ?? item).filter(Boolean))]
  const bags: SchemaFieldValue['values'] = {}
  for (const id of tags) bags[id] = { ...(current.values[id] ?? {}) }
  const applyBag = (packId: string, bag: Record<string, unknown>) => {
    const id = resolvePack(packId)?.id ?? packId
    if (!tags.includes(id)) return
    bags[id] = { ...bags[id], ...remapFacetBag(resolvePack(id), bag) }
  }
  if (isPlainObject(rec.values)) {
    const nested: Array<[string, Record<string, unknown>]> = []
    const flat: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rec.values)) {
      const pack = resolvePack(key)
      const packId = pack?.id ?? (tags.includes(key) ? key : '')
      if (packId && isPlainObject(value)) nested.push([packId, value])
      else flat[key] = value
    }
    for (const [id, bag] of nested) applyBag(id, bag)
    if (Object.keys(flat).length) {
      if (tags.length === 1) applyBag(tags[0]!, flat)
      else {
        for (const [key, value] of Object.entries(flat)) {
          const hit = tags
            .map((id) => resolvePack(id))
            .find((pack) => pack?.fields.some((field) => field.key === key || field.label === key))
          if (hit) applyBag(hit.id, { [key]: value })
        }
      }
    }
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key === 'tags' || key === 'values') continue
    if (tags.length === 1) applyBag(tags[0]!, { [key]: value })
    else {
      const hit = tags.map((id) => resolvePack(id)).find((pack) => pack?.fields.some((field) => field.key === key || field.label === key))
      if (hit) applyBag(hit.id, { [key]: value })
    }
  }
  return bindSchemaValue(tags, bags)
}

function pickWritablePatch(schema: CollectionSchema, patch: Record<string, unknown>) {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id') throw new Error('field not writable: id')
    const field = schema.fields[key]
    if (!field) throw new Error(`unknown field: ${key}`)
    if (!field.writable || field.computed) throw new Error(`field not writable: ${key}`)
    next[key] = coerce(field, value)
  }
  return next
}

function takeBannerPatch(raw: Record<string, unknown>): { present: boolean; value: PageBanner | null } {
  if (!('banner' in raw)) return { present: false, value: null }
  const value = parsePageBanner(raw.banner)
  delete raw.banner
  return { present: true, value }
}

async function assertSameTableLinks(spec: CollectionSpec, patch: Record<string, unknown>, selfId?: string) {
  const ids: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    const field = spec.schema.fields[key]
    if (!field) continue
    const kind = field.type === 'string[]' ? 'multi-select' : field.type
    if (kind === 'ref') {
      const parent = String(value ?? '').trim()
      if (!parent) continue
      if (selfId && parent === selfId) throw new Error('cannot link a record to itself')
      ids.push(parent)
      continue
    }
    if (kind === 'multi-ref') {
      const list = Array.isArray(value) ? value.map((item) => String(item)) : []
      for (const id of list) {
        if (!id) continue
        if (selfId && id === selfId) throw new Error('cannot link a record to itself')
        ids.push(id)
      }
    }
  }
  for (const id of [...new Set(ids)]) {
    const hit = await spec.get(id)
    if (!hit) throw new Error(`unknown record in this table: ${id}`)
  }
}

function navPath(path: string) {
  return normalizeCollectionPath(path)
}

function navTitle(spec: CollectionSpec) {
  return (spec.view?.title ?? spec.label ?? spec.id).trim()
}

function assertViewAvailable(entry: CollectionSpec, others: CollectionSpec[]) {
  const view = entry.view
  if (!view) return
  const route = navPath(view.route || '')
  if (!view.route?.trim()) throw new Error('view.route 必填：导航路由由登记方自己选定')
  if (route === '/' || route === '/s') throw new Error(`view.route 与内置路由冲突：${view.route}`)
  const title = navTitle(entry)
  if (!title) throw new Error('view.title / label 不能为空')
  for (const other of others) {
    if (!other.view || other.id === entry.id) continue
    const otherRoute = navPath(other.view.route)
    const otherTitle = navTitle(other)
    if (other.view.moduleId === view.moduleId) {
      throw new Error(`导航 id 重复：${view.moduleId}`)
    }
    if (otherRoute === route) {
      throw new Error(`路由重复：${route} 已被「${otherTitle}」占用`)
    }
    if (otherTitle === title) {
      throw new Error(`名称重复：导航栏已有「${title}」`)
    }
  }
}

function matchQuery(record: DbRecord, q: string, packs: CollectionSchemaPack[] = []) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  if (String(record.id).toLowerCase().includes(needle)) return true
  for (const [key, value] of Object.entries(record)) {
    if (value == null || value === '') continue
    if (key === 'facet' || (value && typeof value === 'object' && !Array.isArray(value) && 'tags' in (value as object))) {
      if (schemaSearchHaystack(value, packs).toLowerCase().includes(needle)) return true
      continue
    }
    const text = Array.isArray(value) ? value.map(String).join(' ') : typeof value === 'object' ? '' : String(value)
    if (text.toLowerCase().includes(needle)) return true
  }
  return false
}

function matchListFilter(record: DbRecord, filter: Record<string, unknown> | undefined, schema: CollectionSchema, packs: CollectionSchemaPack[] = []) {
  return matchListFilterRecord(record, filter, schema, packs)
}

function sortRecords(rows: DbRecord[], field: string, dir: 'asc' | 'desc', sorts?: Array<{ field: string; dir: 'asc' | 'desc' }>) {
  const rules = normalizeSorts(sorts, field, dir)
  return sortRecordsBy(rows, rules)
}

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

export function clampPage(limit?: number, offset?: number) {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(Number(limit)) ? Number(limit) : DEFAULT_PAGE_SIZE))
  const start = Math.max(0, Number.isFinite(Number(offset)) ? Math.floor(Number(offset)) : 0)
  return { limit: size, offset: start }
}

export class DatabaseService extends Service implements Database {
  private collections = new Map<string, CollectionSpec>()
  facets = new FacetStore()
  shares = new SharesStore()
  assets = new FileSystemAssets()

  private bumpQueued = false

  constructor(ctx: Context) {
    super(ctx, 'database')
  }

  register(spec: CollectionSpec) {
    const path = normalizeCollectionPath(spec.path || `/${spec.id}`)
    if (path === '/') throw new Error('collection path cannot be /')
    if (splitPath(path).length !== 1) throw new Error(`collection path must be one segment: ${path}`)
    let entry = { ...spec, path }
    return this.ctx.effect(() => {
      if (this.collections.has(entry.id)) throw new Error(`collection already registered: ${entry.id}`)
      if ([...this.collections.values()].some((item) => item.path === path && item.id !== entry.id)) {
        throw new Error(`collection path already registered: ${path}`)
      }
      assertViewAvailable(entry, [...this.collections.values()])
      assertRecordCaps(entry)
      const view = entry.view
      if (view) entry = { ...entry, view: { ...view, route: navPath(view.route) } }
      this.collections.set(entry.id, entry)
      this.bump()
      return () => {
        this.collections.delete(entry.id)
        this.bump()
      }
    }, `database.register ${entry.id}`)
  }

  collection(pathOrId: string) {
    const path = normalizeCollectionPath(pathOrId)
    return (
      this.collections.get(pathOrId) ??
      [...this.collections.values()].find((item) => item.path === path || item.id === pathOrId)
    )
  }

  collectionsList() {
    return [...this.collections.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  private async loadCollectionRows(spec: CollectionSpec, query: CollectionListQuery) {
    const rows = await spec.list(query)
    const listed = !query.ids?.length ? rows : rows.filter((row) => query.ids!.includes(row.id))
    return listed.map((row) => this.decorateRecord(spec, row))
  }

  private async matchCollectionRows(
    spec: CollectionSpec,
    query: CollectionListQuery,
    filter: Record<string, unknown> | undefined,
    q: string,
  ) {
    let schema = schemaFor(spec)
    const packs = this.facets.list()
    const rows = await this.loadCollectionRows(spec, query)
    const tagFilter = spec.path === '/facets' ? String(filter?.facetId ?? '').trim() : ''
    const tagPack = tagFilter ? this.facets.get(tagFilter) : null
    if (tagFilter) {
      schema = schemaWithTagPack(schema, tagPack)
      await this.hydrateFacetStamps(rows, tagPack)
    }
    return rows.filter((row) => matchListFilter(row, filter, schema, packs) && matchQuery(row, q, packs))
  }

  private async hydrateFacetStamps(rows: DbRecord[], pack: CollectionSchemaPack | null) {
    if (!pack?.fields.length) return
    const wanted = pack.fields.filter((field) => !STAMP_FIELD_BLOCKLIST.has(field.key))
    if (!wanted.length) return
    for (const row of rows) {
      const collection = String(row.tablePath ?? '')
      const id = String(row.sourceId ?? '')
      const spec = collection ? this.collection(collection) : undefined
      if (!spec || !id) continue
      const found = await spec.get(id)
      if (!found) continue
      const record = this.decorateRecord(spec, found)
      const bag = normalizeSchemaValue(record.facet).values[pack.id] ?? {}
      for (const field of wanted) {
        if (bag[field.key] !== undefined) row[field.key] = bag[field.key]
      }
    }
  }

  private bump() {
    this.ctx.emit('database/change')
    if (this.bumpQueued) return
    this.bumpQueued = true
    queueMicrotask(() => {
      this.bumpQueued = false
      const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
      http?.broadcast?.(DATABASE_CHANNEL, { ts: Date.now() })
    })
  }

  async stat(path: string) {
    const parts = splitPath(path)
    if (parts.length === 0) {
      return {
        kind: 'root' as const,
        path: '/',
        collections: this.collectionsList().map(publicCollection),
      }
    }
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const caps = collectionCaps(spec)
    if (parts.length === 1) {
      return { kind: 'collection' as const, path: spec.path, id: spec.id, label: spec.label ?? spec.id, view: spec.view ?? null, schema: schemaFor(spec), caps }
    }
    if (parts.length === 2) {
      const record = await spec.get(parts[1]!)
      if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
      return {
        kind: 'record' as const,
        path: `${spec.path}/${record.id}`,
        id: spec.id,
        label: spec.label ?? spec.id,
        schema: schemaFor(spec),
        caps,
        value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))),
      }
    }
    throw new Error(`path too deep: ${normalizeCollectionPath(path)}`)
  }

  async list(path: string, filter?: Record<string, unknown>, page?: ListPage) {
    const parts = splitPath(path)
    if (parts.length === 0) {
      return {
        kind: 'root' as const,
        path: '/',
        items: this.collectionsList().map(publicCollection),
      }
    }
    if (parts.length !== 1) throw new Error(`cannot list: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    let schema = schemaFor(spec)
    const { limit, offset } = clampPage(page?.limit, page?.offset)
    const q = page?.q ?? ''
    const sortField = page?.sortField?.trim() || 'title'
    const sortDir = page?.sortDir === 'desc' ? 'desc' : 'asc'
    const schemaFilter = filter?.facet != null && filter.facet !== '' ? String(filter.facet) : ''
    const columnKeys = listedColumnKeys(page?.columns, schema.labelField ?? 'title')
    const query: CollectionListQuery = { q, filter }
    if (schemaFilter && schema.fields.facet && spec.path !== '/facets') {
      const stamped = this.facets.stampedIds(spec.path, schemaFilter)
      if (!stamped.size) {
        return {
          kind: 'collection' as const,
          path: spec.path,
          id: spec.id,
          label: spec.label ?? spec.id,
          view: spec.view ?? null,
          schema,
          total: 0,
          offset,
          limit,
          items: [],
        }
      }
      query.ids = [...stamped]
    }
    const matched = await this.matchCollectionRows(spec, query, filter, q)
    const tagFilter = spec.path === '/facets' ? String(filter?.facetId ?? '').trim() : ''
    if (tagFilter) schema = schemaWithTagPack(schema, this.facets.get(tagFilter))
    const sorted = sortRecords(matched, sortField, sortDir, page?.sorts)
    const total = sorted.length
    const slice = sorted.slice(offset, offset + limit)
    return {
      kind: 'collection' as const,
      path: spec.path,
      id: spec.id,
      label: spec.label ?? spec.id,
      view: spec.view ?? null,
      schema,
      total,
      offset,
      limit,
      items: slice.map((row): DbRecord & { path: string; kind: 'record' } => {
        const value = withoutContent(spec, row)
        const picked = columnKeys ? pickListedFields(value, columnKeys) : value
        return {
          ...picked,
          path: `${spec.path}/${row.id}`,
          kind: 'record',
        }
      }),
    }
  }

  async collectFacet(id: string) {
    const found = this.facets.collect(id)
    const labels = new Map(this.collectionsList().map((spec) => [spec.path, spec.label ?? spec.id]))
    return {
      facet: found.facet,
      items: found.items.map((item) => ({
        ...item,
        collectionLabel: labels.get(item.collection) ?? item.collection,
      })),
    }
  }

  private decorateRecord(spec: CollectionSpec, row: DbRecord): DbRecord {
    const withFacet = this.applyFacetOverlay(spec, row)
    const withPeople = this.applyPersonOverlay(spec, withFacet)
    return this.applyMetaOverlay(spec, withPeople)
  }

  private withBanner(spec: CollectionSpec, row: DbRecord): DbRecord {
    const banner = this.facets.recordBanner(spec.path, row.id)
    const next = { ...row }
    delete next.banner
    if (banner) next.banner = banner
    return next
  }

  private refreshContentRefs(spec: CollectionSpec, record: DbRecord) {
    const schema = schemaFor(spec)
    const field = schema.contentField ?? 'content'
    const banner = this.facets.recordBanner(spec.path, record.id)
    this.facets.replaceContentRefs(spec.path, record.id, collectAssetNames(record[field]), collectAssetNames(banner?.html))
  }

  private applyPersonOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    const meta = this.facets.recordMeta(spec.path, row.id)
    if (!meta) return row
    const editors = asPersonList(meta.updatedBy).map((item) => this.namedPerson(item))
    return {
      ...row,
      ...(meta.createdBy ? { createdBy: this.namedPerson(meta.createdBy) } : {}),
      ...(editors.length ? { updatedBy: editors } : {}),
    }
  }

  private async stampActor(collection: string, recordId: string) {
    const actor = await this.currentPerson()
    const existing = this.facets.recordMeta(collection, recordId)
    this.facets.writeRecordMeta(collection, recordId, {
      ...(existing?.createdBy ? {} : { createdBy: actor }),
      updatedBy: appendPerson(existing?.updatedBy, actor),
    })
  }

  private async currentPerson(): Promise<PersonValue> {
    const sid = currentSessionId()?.trim()
    if (!sid) {
      const name = readWorkspaceProfile().name.trim() || '用户'
      return { kind: 'user', name }
    }
    const name = (await this.querySessionName(sid)) || sid.slice(0, 8)
    return { kind: 'agent', name, sessionId: sid }
  }

  private namedPerson(person: PersonValue): PersonValue {
    if (person.kind !== 'agent' || !person.sessionId) return person
    const peeked = this.peekSessionName(person.sessionId)
    return peeked ? { ...person, name: peeked } : person
  }

  private peekSessionName(sessionId: string): string {
    const sessions = this.collection('/sessions')
    const row = sessions?.get?.(sessionId)
    if (row && typeof (row as Promise<unknown>).then !== 'function') {
      return sessionTitleFromRow(row)
    }
    return sessionTitleFromRow(this.sessionsService()?.peek?.(sessionId))
  }

  private sessionsService(): { peek?: (id: string) => unknown; get?: (id: string) => Promise<unknown> } | undefined {
    try {
      return this.ctx.get('sessions') as { peek?: (id: string) => unknown; get?: (id: string) => Promise<unknown> }
    } catch {
      return undefined
    }
  }

  private async querySessionName(sessionId: string): Promise<string> {
    const peeked = this.peekSessionName(sessionId)
    if (peeked) return peeked
    const sessions = this.collection('/sessions')
    if (sessions?.get) {
      const row = await sessions.get(sessionId)
      const title = sessionTitleFromRow(row)
      if (title) return title
    }
    const row = await this.sessionsService()?.get?.(sessionId)
    return sessionTitleFromRow(row)
  }

  private applyFacetOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    if (!schemaFor(spec).fields.facet) return row
    let overlay = this.facets.recordFacet(spec.path, row.id)
    if (!overlay && row.facet != null) {
      const value = normalizeSchemaValue(row.facet)
      if (!isEmptySchemaValue(value)) overlay = this.persistRecordFacet(spec, row.id, value, row)
    }
    if (!overlay) return row
    return { ...row, facet: overlay }
  }

  private applyMetaOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    let meta = this.facets.recordMeta(spec.path, row.id)
    if ((!meta || meta.tags == null) && Array.isArray(row.tags) && row.tags.length) {
      meta = this.facets.writeRecordMeta(spec.path, row.id, { tags: row.tags.map((item) => String(item)) })
    }
    if (!meta) return row
    return {
      ...row,
      ...(meta.emoji !== null ? { emoji: meta.emoji } : {}),
      ...(meta.tags !== null ? { tags: meta.tags } : {}),
    }
  }

  private collectionCanUpdate(spec: CollectionSpec) {
    return Boolean(spec.records?.update && spec.update)
  }

  private persistRecordFacet(spec: CollectionSpec, recordId: string, facet: unknown, record: DbRecord) {
    const next = normalizeSchemaValue(facet)
    const labelKey = schemaFor(spec).labelField ?? 'title'
    this.facets.writeRecordFacet(spec.path, recordId, next, String(record[labelKey] ?? record.id))
    return next
  }

  private indexFacetRecord(spec: CollectionSpec, record: DbRecord) {
    if (!schemaFor(spec).fields.facet) return
    const labelKey = schemaFor(spec).labelField ?? 'title'
    this.facets.indexRecord(
      spec.path,
      record.id,
      String(record[labelKey] ?? record.id),
      normalizeSchemaValue(record.facet).tags,
    )
  }

  async read(path: string) {
    const parts = splitPath(path)
    if (parts.length === 0) return this.stat('/')
    if (parts.length === 1) return this.list(`/${parts[0]}`)
    if (parts.length !== 2) throw new Error(`cannot read: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const record = await spec.get(parts[1]!)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    return { kind: 'record' as const, path: `${spec.path}/${record.id}`, schema: schemaFor(spec), value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))) }
  }

  async update(path: string, content: unknown) {
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot update: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const schema = schemaFor(spec)
    const raw = parseContent(content)
    const current = await spec.get(parts[1]!)
    if (!current) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    const bannerPatch = takeBannerPatch(raw)
    if ('facet' in raw && schema.fields.facet) {
      if (!schema.fields.facet.writable || schema.fields.facet.computed) throw new Error(`field not writable: facet`)
      raw.facet = coerceFacetPatch(raw.facet, normalizeSchemaValue(this.decorateRecord(spec, current).facet), (id) =>
        this.facets.get(id),
      )
    }
    if (!this.collectionCanUpdate(spec)) {
      const keys = Object.keys(raw)
      const overlayKeys = new Set(['facet', 'emoji', 'tags'])
      if ((keys.length && keys.some((key) => !overlayKeys.has(key))) || (!keys.length && !bannerPatch.present)) {
        throw new Error(`collection cannot update: ${spec.path}`)
      }
      let next: DbRecord = { ...this.decorateRecord(spec, current) }
      if ('facet' in raw) {
        const nextSchema = coerce(schema.fields.facet, raw.facet)
        next = { ...next, facet: this.persistRecordFacet(spec, current.id, nextSchema, next) }
      }
      if ('emoji' in raw || 'tags' in raw) {
        if ('emoji' in raw && (!schema.fields.emoji?.writable || schema.fields.emoji.computed)) {
          throw new Error(`field not writable: emoji`)
        }
        if ('tags' in raw && (!schema.fields.tags?.writable || schema.fields.tags.computed)) {
          throw new Error(`field not writable: tags`)
        }
        const meta = this.facets.writeRecordMeta(spec.path, current.id, {
          ...('emoji' in raw ? { emoji: String(coerce(schema.fields.emoji!, raw.emoji) ?? '') } : {}),
          ...('tags' in raw ? { tags: coerce(schema.fields.tags!, raw.tags) as string[] } : {}),
        })
        next = {
          ...next,
          ...(meta.emoji !== null ? { emoji: meta.emoji } : {}),
          ...(meta.tags !== null ? { tags: meta.tags } : {}),
        }
      }
      if (bannerPatch.present) {
        this.facets.writeRecordBanner(spec.path, current.id, bannerPatch.value)
        next = this.withBanner(spec, next)
      }
      this.refreshContentRefs(spec, next)
      await this.stampActor(spec.path, current.id)
      this.bump()
      const beforeRow = this.decorateRecord(spec, current)
      const beforeSnap: Record<string, unknown> = {}
      const afterSnap: Record<string, unknown> = {}
      for (const key of Object.keys(raw)) {
        beforeSnap[key] = beforeRow[key] ?? null
        afterSnap[key] = next[key] ?? null
      }
      const title = String(next.title ?? next.name ?? current.id).trim() || current.id
      if (Object.keys(beforeSnap).length) {
        await this.ctx.get('contentTurns')?.recordUpdate(`${spec.path}/${current.id}`, title, beforeSnap, afterSnap)
      }
      return {
        kind: 'record' as const,
        path: `${spec.path}/${current.id}`,
        value: withoutContent(spec, this.withBanner(spec, next)),
      }
    }
    const patch = pickWritablePatch(schema, raw)
    await assertSameTableLinks(spec, patch, parts[1])
    let record = Object.keys(patch).length ? await spec.update(parts[1]!, patch) : current
    await this.stampActor(spec.path, record.id)
    if ('emoji' in patch || 'tags' in patch) {
      const meta = this.facets.writeRecordMeta(spec.path, record.id, {
        ...('emoji' in patch ? { emoji: String(patch.emoji ?? '') } : {}),
        ...('tags' in patch ? { tags: Array.isArray(patch.tags) ? patch.tags.map((item) => String(item)) : [] } : {}),
      })
      record = {
        ...record,
        ...(meta.emoji !== null ? { emoji: meta.emoji } : {}),
        ...(meta.tags !== null ? { tags: meta.tags } : {}),
      }
    }
    if (schema.fields.facet && 'facet' in patch) {
      record = { ...record, facet: this.persistRecordFacet(spec, record.id, patch.facet, record) }
    }
    if (bannerPatch.present) {
      this.facets.writeRecordBanner(spec.path, record.id, bannerPatch.value)
    }
    this.indexFacetRecord(spec, this.decorateRecord(spec, record))
    this.refreshContentRefs(spec, this.withBanner(spec, record))
    this.bump()
    const beforeSnap: Record<string, unknown> = {}
    const afterSnap: Record<string, unknown> = {}
    for (const key of Object.keys(patch)) {
      beforeSnap[key] = current[key] ?? null
      afterSnap[key] = record[key] ?? null
    }
    const title = String(record.title ?? record.name ?? record.id).trim() || record.id
    if (Object.keys(patch).length) {
      await this.ctx.get('contentTurns')?.recordUpdate(`${spec.path}/${record.id}`, title, beforeSnap, afterSnap)
    }
    return { kind: 'record' as const, path: `${spec.path}/${record.id}`, value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))) }
  }

  async create(path: string, content?: unknown) {
    const parts = splitPath(path)
    if (parts.length !== 1) throw new Error(`cannot create: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    if (!spec.records?.create || !spec.create) throw new Error(`collection cannot create: ${spec.path}`)
    const schema = schemaFor(spec)
    const rows = parseRecords(content)
    const records: Record<string, unknown>[] = []
    const banners: Array<PageBanner | null | undefined> = []
    for (const row of rows) {
      const bannerPatch = takeBannerPatch(row)
      banners.push(bannerPatch.present ? bannerPatch.value : undefined)
      if ('facet' in row && schema.fields.facet) {
        row.facet = coerceFacetPatch(row.facet, emptySchemaValue(), (id) => this.facets.get(id))
      }
      const patch = pickWritablePatch(schema, row)
      await assertSameTableLinks(spec, patch)
      records.push(patch)
    }
    const meaningful = records.filter((record) => Object.keys(record).length > 0)
    const created = await spec.create(meaningful.length ? meaningful : records.slice(0, 1))
    for (const [index, record] of created.entries()) {
      await this.stampActor(spec.path, record.id)
      const banner = banners[index]
      if (banner !== undefined) this.facets.writeRecordBanner(spec.path, record.id, banner)
      const input = records[index] ?? record
      if ('emoji' in input || 'tags' in input) {
        this.facets.writeRecordMeta(spec.path, record.id, {
          ...('emoji' in input ? { emoji: String(input.emoji ?? '') } : {}),
          ...('tags' in input ? { tags: Array.isArray(input.tags) ? input.tags.map((item) => String(item)) : [] } : {}),
        })
      }
      if (schema.fields.facet) {
        this.persistRecordFacet(spec, record.id, input.facet ?? record.facet, record)
      }
      this.indexFacetRecord(spec, this.decorateRecord(spec, record))
      this.refreshContentRefs(spec, this.withBanner(spec, record))
    }
    this.bump()
    const items = created.map((record) => ({
      kind: 'record' as const,
      path: `${spec.path}/${record.id}`,
      value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))),
    }))
    for (const item of items) {
      const title = String(item.value.title ?? item.value.name ?? '').trim() || item.path
      await this.ctx.get('contentTurns')?.recordCreate(item.path, title, item.value)
    }
    return {
      kind: 'created' as const,
      path: spec.path,
      items,
    }
  }

  async remove(path: string, query: CollectionListQuery = {}) {
    const parts = splitPath(path)
    if (parts.length !== 1) throw new Error(`cannot delete: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    if (!spec.records?.delete || !spec.remove) throw new Error(`collection cannot delete: ${spec.path}`)
    if (!hasCollectionDeleteQuery(query)) throw new Error('delete requires ids, q, or filter')
    const schema = schemaFor(spec)
    const q = query.q ?? ''
    const filter = query.filter
    const listQuery: CollectionListQuery = { q, filter, ids: query.ids }
    const schemaFilter = filter?.facet != null && filter.facet !== '' ? String(filter.facet) : ''
    if (schemaFilter && schema.fields.facet && spec.path !== '/facets') {
      const stamped = this.facets.stampedIds(spec.path, schemaFilter)
      if (!stamped.size) return { kind: 'deleted' as const, path: spec.path, ids: [] as string[] }
      listQuery.ids = query.ids?.length ? query.ids.filter((id) => stamped.has(id)) : [...stamped]
    }
    const matched = await this.matchCollectionRows(spec, listQuery, filter, q)
    const ids = [...new Set(matched.map((row) => row.id))]
    if (!ids.length) return { kind: 'deleted' as const, path: spec.path, ids }
    for (const row of matched) {
      const rec = withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, row)))
      const title = String(rec.title ?? rec.name ?? row.id).trim() || row.id
      await this.ctx.get('contentTurns')?.recordDelete(`${spec.path}/${row.id}`, title, rec)
    }
    await spec.remove({ ids })
    for (const id of ids) {
      this.facets.removeRecord(spec.path, id)
      this.shares.revokeRecord(spec.path, id)
    }
    if (spec.path === '/views') {
      for (const row of matched) {
        const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
        const viewId = String(row.viewId ?? '').trim()
        if (collection && collection !== '/' && viewId) this.shares.revokeView(collection, viewId)
      }
    }
    this.bump()
    return { kind: 'deleted' as const, path: spec.path, ids }
  }

  async action(path: string, actionId: string, args?: Record<string, unknown>) {
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot action: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const action = spec.actions?.find((item) => item.id === actionId)
    if (!action) throw new Error(`unknown action: ${actionId}`)
    const record = (await spec.get(parts[1]!)) ?? (action.allowMissing ? { id: parts[1]! } : null)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    if (!matchActionWhen(record, action.when)) throw new Error(`action not available: ${actionId}`)
    const result = await action.run(parts[1]!, record, args)
    const next = (await spec.get(parts[1]!)) ?? record
    this.indexFacetRecord(spec, next)
    this.bump()
    return {
      kind: 'record' as const,
      path: `${spec.path}/${next.id}`,
      value: withoutContent(spec, next),
      ...(result !== undefined ? { result } : {}),
    }
  }

  async content(path: string) {
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot content: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const schema = schemaFor(spec)
    const field = schema.contentField ?? 'content'
    if (!schema.fields[field]) throw new Error(`no content field: ${field}`)
    const record = await spec.get(parts[1]!)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    return {
      kind: 'content' as const,
      path: `${spec.path}/${record.id}`,
      field,
      value: record[field] ?? null,
    }
  }

  async writeContent(path: string, value: unknown) {
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot write content: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    if (!spec.update) throw new Error(`collection cannot update: ${spec.path}`)
    const schema = schemaFor(spec)
    const field = schema.contentField ?? 'content'
    if (!schema.fields[field]) throw new Error(`no content field: ${field}`)
    const patch = this.collectionCanUpdate(spec)
      ? pickWritablePatch(schema, { [field]: value })
      : { [field]: value }
    const record = await spec.update(parts[1]!, patch)
    await this.stampActor(spec.path, record.id)
    this.refreshContentRefs(spec, this.withBanner(spec, record))
    this.bump()
    return {
      kind: 'content' as const,
      path: `${spec.path}/${record.id}`,
      field,
      value: record[field] ?? null,
    }
  }

  async contentTitle(path: string) {
    const parts = splitPath(path)
    if (parts.length !== 2) return path
    const spec = this.collection(`/${parts[0]}`)
    const record = spec ? await spec.get(parts[1]!) : null
    const title = String(record?.title ?? record?.name ?? '').trim()
    return title || parts[1] || path
  }

  async editContent(path: string, args: Record<string, unknown> = {}) {
    const command = resolveContentCommand(args)
    const current = await this.content(path)
    const text = asContentText(current.value)
    if (command === 'view') {
      const viewed = viewContent(text, args.view_range)
      return {
        kind: 'content' as const,
        path: current.path,
        field: current.field,
        command,
        start: viewed.start,
        end: viewed.end,
        total: viewed.total,
        truncated: viewed.truncated,
        text: viewed.text,
      }
    }
    let replaced: number | undefined
    const next =
      command === 'write'
        ? writeContentText(await resolveWriteValue(args))
        : command === 'str_replace'
          ? strReplaceText(text, args.old_str, args.new_str)
          : command === 'find_replace'
            ? resolveFindReplace(text, args)
            : command === 'insert'
              ? insertText(text, args.insert_line, args.new_str)
              : replaceLinesText(text, args.start_line, args.end_line, args.new_str)
    if (typeof next === 'object') {
      replaced = next.replaced
    }
    const nextText = typeof next === 'object' ? next.text : next
    await this.writeContent(path, nextText)
    const locus = mutationLocus(command === 'find_replace' ? 'str_replace' : command, text, nextText, args)
    const written = await this.content(current.path)
    const after = asContentText(written.value)
    const title = await this.contentTitle(current.path)
    await this.ctx.get('contentTurns')?.recordEdit(current.path, text, after, title)
    return {
      kind: 'content' as const,
      path: current.path,
      field: current.field,
      command,
      ok: true as const,
      ...(replaced != null ? { replaced } : {}),
      ...(locus ? { start_line: locus.start_line, end_line: locus.end_line, ...(locus.text ? { text: locus.text } : {}) } : {}),
    }
  }

  async editAsset(path: string, args: Record<string, unknown> = {}) {
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot asset: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const record = await spec.get(parts[1]!)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    const names = new Set([
      ...collectAssetNames(record, this.facets.recordBanner(spec.path, record.id)?.html),
      ...this.facets.listedAttachmentNames(spec.path, record.id),
    ])
    const file = String(args.name ?? '')
      .trim()
      .replace(/^assets\//, '')
      .replace(/^.*[/\\]/, '')
    const from = String(args.from ?? '').trim()
    const command = String(args.command ?? (args.value != null || from ? 'write' : 'view'))
    const recPath = `${spec.path}/${record.id}`
    if (command === 'view' && !file) {
      const assets = []
      for (const name of [...names].sort()) {
        try {
          const read = await this.assets.read(name)
          assets.push({ name, etag: read.etag, type: read.type })
        } catch {
          assets.push({ name, missing: true })
        }
      }
      return { kind: 'asset' as const, path: recPath, command: 'view' as const, assets }
    }
    if (!isAssetFileName(file)) throw new Error('invalid asset')
    if (command === 'view') {
      if (!names.has(file)) throw new Error(`asset not referenced: ${file}`)
      try {
        const read = await this.assets.read(file)
        const text =
          read.type.startsWith('text/') || read.type.includes('json') ? read.bytes.toString('utf8') : undefined
        return {
          kind: 'asset' as const,
          path: recPath,
          command: 'view' as const,
          name: file,
          etag: read.etag,
          type: read.type,
          ...(text != null ? { text } : {}),
        }
      } catch {
        return {
          kind: 'asset' as const,
          path: recPath,
          command: 'view' as const,
          name: file,
          missing: true,
          etag: '',
        }
      }
    }
    if (command !== 'write') throw new Error(`unknown asset command: ${command}`)
    const body = from ? await readLocalWriteFile(from) : String(args.value ?? '')
    if (!from && args.value == null) throw new Error('write needs value or from')
    const written = await this.assets.write(file, body)
    const kind = String(args.kind ?? '') === 'core' ? 'core' : 'asset'
    const blockId = String(args.block_id ?? args.blockId ?? '').trim()
    const source = String(args.source ?? (blockId ? `block:${blockId}` : 'asset')).trim() || 'asset'
    this.facets.putAttachment({
      name: written.name,
      etag: written.etag,
      mime: mimeOfAsset(written.name),
      bytes: written.bytes,
      kind,
    })
    if (Array.isArray(args.refs)) {
      const refs = args.refs.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const rec = item as Record<string, unknown>
        const name = String(rec.name ?? '').trim()
        if (!isAssetFileName(name)) return []
        return [{ name, source: String(rec.source ?? source) }]
      })
      if (blockId) this.facets.replaceBlockRefs(spec.path, record.id, blockId, refs.length ? refs : [{ name: written.name, source }])
    } else if (blockId) {
      this.facets.upsertBlockRef(spec.path, record.id, blockId, written.name, source)
    }
    this.broadcastAsset(recPath, written.name, written.etag)
    return { kind: 'asset' as const, ok: true as const, path: recPath, name: written.name, etag: written.etag }
  }

  private broadcastAsset(path: string, name: string, etag: string) {
    const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
    http?.broadcast?.(DATABASE_CHANNEL, { ts: Date.now(), asset: { name, etag, path } })
  }
}

async function readLocalWriteFile(raw: string) {
  const file = isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
  try {
    return await readFile(file)
  } catch {
    throw new Error(`cannot read from: ${raw}`)
  }
}

/**
 * write 正文：优先用 value，其次用 from 指向的本地文件（工作区或 /tmp）。
 * value 与 from 互斥，同时给出时报错。
 */
async function resolveWriteValue(args: Record<string, unknown>): Promise<string> {
  const hasValue = args.value !== undefined || args.new_str !== undefined
  const rawFrom = String(args.from ?? '').trim()
  if (rawFrom && hasValue) throw new Error('write accepts either value or from, not both')
  if (rawFrom) {
    const bytes = await readLocalWriteFile(rawFrom)
    return bytes.toString('utf8')
  }
  return asContentText(args.value ?? args.new_str)
}

function resolveFindReplace(text: string, args: Record<string, unknown>) {
  return findReplaceText(text, args.old_str, args.new_str, {
    regex: args.regex,
    all: args.all,
    count: args.count,
  })
}

function parseContent(content: unknown): Record<string, unknown> {
  if (typeof content === 'string') {
    const trimmed = content.trim()
    if (!trimmed) return {}
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('content must be an object')
    return parsed as Record<string, unknown>
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('content must be an object')
  return content as Record<string, unknown>
}

function parseRecords(content: unknown): Record<string, unknown>[] {
  const raw = typeof content === 'string' ? JSON.parse(content.trim() || 'null') : content
  if (!Array.isArray(raw) || !raw.length) throw new Error('records must be a non-empty array')
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`records[${index}] must be an object`)
    return item as Record<string, unknown>
  })
}

const PATH_PARAM = { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } as const

function asColumnKeys(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const keys = value.map((item) => String(item).trim()).filter(Boolean)
  return keys.length ? keys : undefined
}

function parseListColumnsParam(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  const text = raw.trim()
  if (!text) return undefined
  if (text.startsWith('[')) {
    try {
      return asColumnKeys(JSON.parse(text) as unknown)
    } catch {
      return undefined
    }
  }
  return asColumnKeys(text.split(','))
}

function parseSortsParam(raw: string | null): Array<{ field: string; dir: 'asc' | 'desc' }> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return undefined
    const out: Array<{ field: string; dir: 'asc' | 'desc' }> = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const field = String((item as { field?: unknown }).field ?? '').trim()
      if (!field) continue
      out.push({ field, dir: (item as { dir?: unknown }).dir === 'desc' ? 'desc' : 'asc' })
    }
    return out.length ? out : undefined
  } catch {
    return undefined
  }
}

function asFilter(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function asIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function asDeleteQuery(args: Record<string, unknown>): CollectionListQuery {
  return {
    ids: asIds(args.ids),
    q: args.q != null ? String(args.q) : undefined,
    filter: asFilter(args.filter),
  }
}

function asCreateRecords(args: Record<string, unknown>) {
  const value = args.records !== undefined ? args.records : args.content
  if (!Array.isArray(value)) return value
  const records = value.filter((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return true
    return Object.keys(item).length > 0
  })
  if (!records.length) throw new Error('records must include at least one non-empty object')
  return records
}

function broadcastInspectorReveal(
  ctx: Context,
  path: string,
  result: unknown,
  dropRecord: boolean,
  phase: 'working' | 'done',
) {
  const reveal = databaseRevealForTool({ path, result, dropRecord })
  if (!reveal) return
  const http = ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
  const contentJump = phase === 'done' ? parseContentJump(result) : null
  http?.broadcast?.(DATABASE_CHANNEL, {
    ts: Date.now(),
    reveal,
    phase,
    sessionId: currentSessionId(),
    ...(savedViewFromToolResult(result) ? { savedView: savedViewFromToolResult(result) } : {}),
    ...(contentJump ? { contentJump } : {}),
  })
}

function rowFromToolResult(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined
  const rec = result as { kind?: unknown; items?: unknown; value?: unknown }
  if (rec.kind === 'created') {
    const items = rec.items
    if (!Array.isArray(items) || !items[0] || typeof items[0] !== 'object') return undefined
    const value = (items[0] as { value?: unknown }).value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  }
  if (rec.kind === 'record') {
    const value = rec.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  }
  return undefined
}

function savedViewFromToolResult(result: unknown) {
  return clientViewFromDbRow(rowFromToolResult(result))
}

async function withInspectorReveal<T>(
  ctx: Context,
  path: string,
  op: () => T | Promise<T>,
  dropRecord = false,
) {
  broadcastInspectorReveal(ctx, path, undefined, dropRecord, 'working')
  try {
    const result = await op()
    broadcastInspectorReveal(ctx, path, result, dropRecord, 'done')
    return result
  } catch (error) {
    broadcastInspectorReveal(ctx, path, undefined, dropRecord, 'done')
    throw error
  }
}
export const name = 'core-file-system'
export const inject = ['tools', 'http']

export function apply(ctx: Context) {
  const db = new DatabaseService(ctx)
  db.facets.open(dataPath(dataHome(), 'biu.sqlite'))
  const assets = db.assets
  const savedViews = new SavedViewsStore()
  savedViews.open(process.env.VITEST ? ':memory:' : dataPath(dataHome(), 'biu.sqlite'))
  const shares = db.shares
  shares.open(process.env.VITEST ? ':memory:' : dataPath(dataHome(), 'biu.sqlite'))
  const facets = db.facets
  db.register(viewsCollection(savedViews, () => db.collectionsList().map((item) => ({
    id: item.id,
    path: item.path,
    kind: 'collection' as const,
    label: item.label ?? item.id,
    view: item.view ?? null,
  }))))
  db.register(facetsCollection(facets, () => db.collectionsList().map((item) => ({
    id: item.id,
    path: item.path,
    label: item.label ?? item.id,
  }))))
  const notices = new NoticesService(ctx).open(process.env.VITEST ? ':memory:' : dataPath(dataHome(), 'notices.json'))
  db.register(noticesCollection(notices.store))
  ctx.http.route('POST', '/api/db/notices/clear', (route) => {
    route.send(200, { ok: true, cleared: notices.clear() })
  })
  const contentTurns = new ContentTurnService(ctx).open(
    process.env.VITEST ? ':memory:' : dataPath(dataHome(), 'content-turns.json'),
  )
  ctx.http.route('GET', '/api/content-turns/file', (route) => {
    const session = String(route.query.get('session') ?? '').trim()
    const turn = Number(route.query.get('turn'))
    const path = String(route.query.get('path') ?? '').trim()
    const file = contentTurns.snapshot(session, turn, path)
    if (!file) {
      route.send(404, { error: 'missing' })
      return
    }
    route.send(200, { before: file.before, after: file.after })
  })
  ctx.tools.register({
    name: 'db_list',
    description: '列出 File System 路径：/ 为已登记表（path、中文名、view.blurb 说明书），/<表> 为列式记录（不含 content、默认不含 createdAt/updatedAt/createdBy/updatedBy）。默认每页 50，最多 200。columns 参数只取需要的列。表结构用 db_stat。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        filter: { type: 'object', description: '可选，按列等值过滤' },
        q: { type: 'string', description: '可选，全文搜索' },
        sortField: { type: 'string' },
        sortDir: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'number', description: '每页条数，默认 50，最大 200' },
        offset: { type: 'number' },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: '可选，只返回这些列。始终带 id。label 等于标题列（默认 title）。不传则除 content 外全返回。',
        },
      },
      required: ['path'],
    },
    execute: (args) => {
      const path = String(args.path)
      return withInspectorReveal(ctx, path, () =>
        db
          .list(path, asFilter(args.filter), {
            q: args.q != null ? String(args.q) : '',
            sortField: args.sortField != null ? String(args.sortField) : '',
            sortDir: args.sortDir === 'desc' ? 'desc' : 'asc',
            limit: args.limit != null ? Number(args.limit) : undefined,
            offset: args.offset != null ? Number(args.offset) : undefined,
            columns: asColumnKeys(args.columns),
          })
          .then((body) => agentDbCompact.query(body)),
      )
    },
  })
  ctx.tools.register({
    name: 'db_read',
    description: '读取 File System 路径：表返回列式列表 columns/rows（不含 schema，结构用 db_stat），记录返回该行 JSON（空字段省略，不含 content 正文，正文用 db_content）。',
    parameters: PATH_PARAM,
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.read(String(args.path)).then((body) => agentDbCompact.query(body))),
  })
  ctx.tools.register({
    name: 'db_update',
    description: '按表结构 schema 的可写字段更新一条已有记录，路径为 /<表>/<id>。成功只返回 {ok, path}，不回整行。合集 facet：可同时贴多个。一个合集用扁平 values，如 {tags:["facet-2"],values:{导演:"查泽雷"}}；多个合集必须按合集分子对象，如 {tags:["facet-2","awards"],values:{"facet-2":{导演:"查泽雷"},awards:{oscar:true}}}。省略 tags 则改当前已贴合集的属性（合并，不撕掉别的合集）。改合集定义用 db_update /facets/<id> content.fields。新建用 db_create，正文用 db_content。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: {
          description:
            '要更新的字段（对象或 JSON 字符串）。合集写 facet：一个合集 values 扁平，如 {facet:{tags:["facet-2"],values:{导演:"查泽雷"}}}；多个合集 values 按合集 id 分子对象。省略 tags 只改属性，不撕掉其它合集。',
        },
      },
      required: ['path', 'content'],
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.update(String(args.path), args.content)).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  ctx.tools.register({
    name: 'db_create',
    description: '在已登记且允许新建的表中批量新增记录。路径为 /<表>，records 为对象数组。成功返回 {ok, path, ids}，不回整行。能否新建看 db_stat 的 caps。新建合集用 db_create path=/facets records=[{title}]。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        records: {
          type: 'array',
          items: { type: 'object' },
          description: '要创建的记录（非空对象数组），按 schema 可写字段给初值；不要附加空对象',
        },
      },
      required: ['path', 'records'],
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.create(String(args.path), asCreateRecords(args))).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  ctx.tools.register({
    name: 'db_delete',
    description: '按条件删除记录。路径为 /<表>，必须带 ids、q 或 filter 之一，禁止无条件清空全表。能否删除看 db_stat 的 caps。调用后会进入审批，用户同意才真正删。成功返回 {ok, path, ids}。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        ids: { type: 'array', items: { type: 'string' }, description: '要删除的 id 列表' },
        q: { type: 'string', description: '全文搜索条件' },
        filter: { type: 'object', description: '按列等值过滤' },
      },
      required: ['path'],
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.remove(String(args.path), asDeleteQuery(args)), true).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  ctx.tools.register({
    name: 'db_action',
    description:
      '对一条记录执行该表登记的动作。路径为 /<表>/<id>，action 为动作 id（见 db_stat 的 schema.actions）。成功返回 {ok, path}，有返回值时带 result，不回整行。需要参数时放在 args。任务派工/汇报、会话压缩/进度、插件创建/打包一律走这里。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        action: { type: 'string' },
        args: { type: 'object', description: '可选，动作参数（见 schema.actions[].parameters）' },
      },
      required: ['path', 'action'],
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.action(
          String(args.path),
          String(args.action),
          args.args && typeof args.args === 'object' && !Array.isArray(args.args)
            ? (args.args as Record<string, unknown>)
            : undefined,
        ),
      ).then((body) => agentDbCompact.write(body)),
  })
  ctx.tools.register({
    name: 'db_stat',
    description: agentDbCompact.statBlurb,
    parameters: PATH_PARAM,
    execute: (args) => Promise.resolve(db.stat(String(args.path))).then((body) => agentDbCompact.query(body)),
  })
  ctx.tools.register({
    name: 'db_content',
    description: [
      '读写一条记录的正文。list/read 不含正文。path 为 /<表>/<id>。',
      'command=view：带行号读一段正文，默认前 80 行，可用 view_range=[start,end]（1-based，end=-1 到末尾）；truncated 表示还有未读行。',
      'command=str_replace：old_str 必须在正文里唯一，替换为 new_str。',
      'command=replace_lines：按 1-based 闭区间 start_line..end_line 换成 new_str。',
      'command=insert：在 insert_line 之后插入 new_str（0 插到第一行前）。',
      'command=find_replace：批量替换。默认等价 str_replace（old_str 必须唯一）；all=true 替换所有匹配（可用 count 限制次数），regex=true 时 old_str 按正则解释。返回 replaced 为实际替换次数。',
      'command=write：整篇覆盖。正文用 value 内联，或用 from=<本地文件路径>（工作区或 /tmp）从文件导入，二者互斥、不可同时给。写成功只返回 {ok, path}，不含全文。str_replace / find_replace / replace_lines / insert 成功额外返回 start_line、end_line（改后正文的 1-based 行）。编辑器会标出该段改动，不抢输入焦点、不自动跳转；跳转只在用户主动点目录或查找时发生。',
      '页面插图：不要把 data URL / base64 写进正文。先把图片文件落到工作区（下载或生成），再用 db_asset command=write name=<逻辑名.ext> from=<本地路径> 入库（内容寻址，返回 name=<哈希.ext>），然后 insert/str_replace 写入一行 Markdown：![说明](/api/db/file/<哈希.ext>)。也可以先写这一行再 write 附件。',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        command: {
          type: 'string',
          enum: ['view', 'str_replace', 'find_replace', 'replace_lines', 'insert', 'write'],
          description:
            'view | str_replace | find_replace | replace_lines | insert | write。省略时：有 value 或 from 则 write，否则 view。',
        },
        value: { type: 'string', description: 'write 的全文（与 from 互斥）' },
        from: { type: 'string', description: 'write：从该本地文件路径（工作区或 /tmp）导入正文，代替 value' },
        old_str: { type: 'string', description: 'str_replace / find_replace 要替换的原文；find_replace 且 regex=true 时按正则解释' },
        new_str: { type: 'string', description: 'str_replace / find_replace / insert / replace_lines 的新文本' },
        regex: { type: 'boolean', description: 'find_replace：old_str 是否按正则解释（默认 false）' },
        all: { type: 'boolean', description: 'find_replace：是否替换所有匹配（默认 false，等价 str_replace 的唯一性要求）' },
        count: { type: 'integer', description: 'find_replace：最多替换几处（默认不限）' },
        insert_line: { type: 'integer', description: 'insert：在该行之后插入' },
        start_line: { type: 'integer', description: 'replace_lines 起始行（含）' },
        end_line: { type: 'integer', description: 'replace_lines 结束行（含）' },
        view_range: {
          type: 'array',
          items: { type: 'integer' },
          description: 'view 的行区间，如 [11, 20] 或 [80, -1]',
        },
      },
      required: ['path'],
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.editContent(String(args.path), args).then((body) => agentDbCompact.query(body)),
      ),
  })
  ctx.tools.register({
    name: 'db_asset',
    description: [
      '读写一条记录的附件（画板 json、图片、块核心数据），不是正文。正文仍用 db_content。',
      'path 为 /<表>/<id>。write 时 name 只取扩展名（如 board.json / bgm.mp3）；落盘为 .biu/assets/<2>/<2>/<哈希>.<ext>，返回的 name/etag 即该哈希文件名。引用写成 /api/db/file/<哈希.ext>。',
      'command=view：不传 name 列出 content_refs + block_refs（及正文里扫到的 URL）；带 name 读该文件。引用了但文件还不存在时返回 missing=true、etag 空串。',
      'command=write：内容寻址写入，相同字节不重复存。可带 block_id / source（如 block:<id>:bgm）/ kind=core|asset 做插件登记；refs 为该块当前引用的完整列表时宿主做 diff。',
      '插图：先 write 图片（from=本地路径），再用返回的 name 插入 ![说明](/api/db/file/<name>)。不要把图片 base64 写进 db_content。',
      '大内容不要塞进 value：先用 bash/python 写到本地文件，再 from=该路径。value 只适合短文本。',
      '写成功只返回 {ok, path, name, etag}。',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        name: { type: 'string', description: '附件文件名，如 画板-ab12cd.json' },
        command: {
          type: 'string',
          enum: ['view', 'write'],
          description: 'view | write。省略时：有 value 或 from 则 write，否则 view。',
        },
        value: { type: 'string', description: 'write 的全文（json/文本）。大文件用 from，不要把整段 JSON 贴进来。' },
        from: {
          type: 'string',
          description: 'write 时读这个本地文件作为内容，代替 value。相对工作区根，或绝对路径。',
        },
        etag: { type: 'string', description: '内容寻址后与 name 相同；write 不再做同名覆盖冲突' },
        block_id: { type: 'string', description: '块级归属，写入 block_refs' },
        source: { type: 'string', description: '引用子键，如 block:<id>:bgm' },
        kind: { type: 'string', description: 'core（永不自动回收）或 asset' },
        refs: {
          type: 'array',
          items: { type: 'object' },
          description: '该 block_id 当前引用的完整列表 [{name, source}]，宿主 diff 后写 block_refs',
        },
      },
      required: ['path'],
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.editAsset(String(args.path), args).then((body) => agentDbCompact.query(body)),
      ),
  })

  const send = async (route: { query: URLSearchParams; send: (status: number, body: unknown) => void }, op: () => unknown) => {
    try {
      route.send(200, await op())
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  }
  ctx.http.route('GET', '/api/profile', (route) => {
    route.send(200, asPublicProfile())
  })
  ctx.http.route('POST', '/api/profile', async (route) => {
    try {
      const body = (await route.json()) as { name?: unknown; avatar?: unknown; theme?: unknown }
      route.send(200, asPublicProfile(writeWorkspaceProfile({
        name: typeof body.name === 'string' ? body.name : undefined,
        avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
        theme: body.theme === 'dark' || body.theme === 'light' ? body.theme : undefined,
      })))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/db/list', (route) =>
    send(route, () => {
      let filter: Record<string, unknown> | undefined
      const raw = route.query.get('filter')
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) filter = parsed as Record<string, unknown>
        } catch {
          filter = undefined
        }
      }
      return db.list(route.query.get('path') || '/', filter, {
        q: route.query.get('q') || '',
        sortField: route.query.get('sort') || '',
        sortDir: route.query.get('dir') === 'desc' ? 'desc' : 'asc',
        sorts: parseSortsParam(route.query.get('sorts')),
        limit: route.query.get('limit') ? Number(route.query.get('limit')) : undefined,
        offset: route.query.get('offset') ? Number(route.query.get('offset')) : undefined,
        columns: parseListColumnsParam(route.query.get('columns')),
      })
    }),
  )
  ctx.http.route('GET', '/api/db/read', (route) => send(route, () => db.read(route.query.get('path') || '/')))
  ctx.http.route('GET', '/api/db/banner-gallery', (route) =>
    send(route, () => ({ items: db.facets.listBannerGallery() })),
  )
  ctx.http.route('POST', '/api/db/banner-gallery', async (route) => {
    try {
      const body = (await route.json()) as { id?: string }
      const id = String(body?.id ?? '').trim()
      if (!id) {
        route.send(400, { error: 'id required' })
        return
      }
      route.send(200, { ok: db.facets.forgetBannerGallery(id) })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/db/stat', (route) => send(route, () => db.stat(route.query.get('path') || '/')))
  ctx.http.route('GET', '/api/db/content', (route) => send(route, () => db.content(route.query.get('path') || '/')))
  ctx.http.route('POST', '/api/db/content', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; value?: unknown }
      route.send(200, await db.writeContent(String(body?.path ?? ''), body?.value))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/update', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; content?: unknown }
      route.send(200, await db.update(String(body?.path ?? ''), body?.content))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/create', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; records?: unknown; content?: unknown }
      route.send(200, await db.create(String(body?.path ?? ''), body?.records ?? body?.content))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/delete', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; ids?: unknown; q?: unknown; filter?: unknown }
      route.send(200, await db.remove(String(body?.path ?? ''), asDeleteQuery((body ?? {}) as Record<string, unknown>)))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/saved-views', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; views?: StoredView[] }
      const path = String(body?.path ?? '')
      const next = Array.isArray(body.views) ? body.views : []
      dropSharesForRemovedViews(shares, path, savedViews.viewsFor(path), next)
      savedViews.replace(path, next)
      ctx.emit('database/change')
      route.send(200, { ok: true })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  const sharePasswordOf = (route: { req: { headers: IncomingMessage['headers'] }; query: URLSearchParams }, body?: { password?: unknown }) => {
    const header = String(route.req.headers['x-share-password'] ?? '')
    if (header) return header
    const query = route.query.get('password')
    if (query) return query
    return String(body?.password ?? '')
  }
  const sharePreviewOf = async (kind: 'view' | 'record', collection: string, viewId: string, recordId: string) => {
    try {
      const snap = await buildShareSnapshot(db, savedViews, {
        token: '',
        kind,
        collection,
        viewId,
        recordId,
        hasPassword: false,
        sharePlugins: true,
        allowCopy: true,
        createdAt: 0,
        updatedAt: 0,
      })
      return collectShareResources(snap.records, snap.contents, snap.records.map((row) => String(row.id)))
    } catch {
      return { pages: 0, plugins: 0, collections: 0, pluginIds: [] as string[] }
    }
  }
  ctx.http.route('GET', '/api/db/shares', async (route) => {
    const collection = route.query.get('collection') || ''
    if (!collection) {
      const items = []
      for (const share of shares.list()) {
        let title = share.collection.replace(/^\//, '')
        if (share.kind === 'record' && share.recordId) {
          try {
            const got = (await db.read(`${share.collection}/${share.recordId}`)) as { value?: { title?: unknown; name?: unknown } }
            title = String(got.value?.title ?? got.value?.name ?? share.recordId)
          } catch {
            shares.revoke(share.token)
            continue
          }
        } else {
          const named = savedViews.viewsFor(share.collection).find((item) => item.id === share.viewId)
          if (!named && share.viewId && !isReadOnlyViewId(share.viewId)) {
            shares.revoke(share.token)
            continue
          }
          let collectionLabel = share.collection.replace(/^\//, '')
          try {
            const stat = (await db.stat(share.collection)) as { label?: string; view?: { title?: string } | null }
            collectionLabel = String(stat.view?.title ?? stat.label ?? collectionLabel)
          } catch {
            /* keep path slug */
          }
          title = displayNameForView(
            share.viewId,
            { path: share.collection, label: collectionLabel, view: { title: collectionLabel } },
            named?.name,
          )
        }
        items.push({ ...share, title, url: publicShareUrl(route.req, share.token) })
      }
      route.send(200, { shares: items })
      return
    }
    const kind = route.query.get('kind') === 'record' ? 'record' as const : 'view' as const
    const viewId = route.query.get('viewId') || ''
    const recordId = route.query.get('recordId') || ''
    const share = shares.find(kind, collection, viewId, recordId)
    const resources = await sharePreviewOf(kind, collection, viewId, recordId)
    route.send(200, {
      share: share ? { ...share, url: publicShareUrl(route.req, share.token) } : null,
      resources,
    })
  })
  ctx.http.route('POST', '/api/db/shares', async (route) => {
    try {
      const body = (await route.json()) as {
        kind?: string
        collection?: string
        viewId?: string
        recordId?: string
        password?: string | null
        enabled?: boolean
        sharePlugins?: boolean
        allowCopy?: boolean
      }
      const kind = body.kind === 'record' ? 'record' as const : 'view' as const
      if (body.enabled === false) {
        shares.revokeTarget(kind, String(body.collection ?? ''), body.viewId ?? '', body.recordId ?? '')
        route.send(200, { share: null })
        return
      }
      const share = shares.upsert({
        kind,
        collection: String(body.collection ?? ''),
        viewId: body.viewId,
        recordId: body.recordId,
        password: body.password,
        sharePlugins: body.sharePlugins,
        allowCopy: body.allowCopy,
      })
      route.send(200, { share: { ...share, url: publicShareUrl(route.req, share.token) } })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/share/:token', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    try {
      const snapshot = await buildShareSnapshot(db, savedViews, share)
      route.send(200, snapshot)
    } catch (error) {
      const msg = String(error)
      if (share.kind === 'record' && /unknown record/.test(msg)) {
        shares.revoke(token)
        route.send(404, { error: 'not found' })
        return
      }
      route.send(400, { error: msg })
    }
  })
  ctx.http.route('POST', '/api/share/:token', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    const body = (await route.json()) as { password?: string }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route, body))) {
      route.send(401, { needsPassword: true })
      return
    }
    try {
      const snapshot = await buildShareSnapshot(db, savedViews, share)
      route.send(200, snapshot)
    } catch (error) {
      const msg = String(error)
      if (share.kind === 'record' && /unknown record/.test(msg)) {
        shares.revoke(token)
        route.send(404, { error: 'not found' })
        return
      }
      route.send(400, { error: msg })
    }
  })
  ctx.http.route('GET', '/api/share/:token/file/:name', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    try {
      const snapshot = await buildShareSnapshot(db, savedViews, share)
      const name = route.params.name ?? ''
      if (!snapshot.assets.includes(name)) {
        route.send(404, { error: 'not found' })
        return
      }
      const { bytes, type, etag } = await assets.read(name)
      route.res.writeHead(200, {
        'content-type': type,
        'cache-control': 'no-store',
        etag: `"${etag}"`,
      })
      route.res.end(bytes)
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('GET', '/api/share/:token/plugin/:id/web.js', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    const id = String(route.params.id ?? '')
    try {
      const snapshot = await buildShareSnapshot(db, savedViews, share)
      if (!snapshot.pluginIds.includes(id)) {
        route.send(404, { error: 'not found' })
        return
      }
      const body = readSharePluginWebJs(process.cwd(), id)
      if (!body) {
        route.send(404, { error: 'not found' })
        return
      }
      route.res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      route.res.end(body)
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('GET', '/api/share/:token/plugin/:id', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    if (!share.sharePlugins) {
      route.send(403, { error: 'plugins are not shared' })
      return
    }
    const id = String(route.params.id ?? '').replace(/\.zip$/i, '')
    try {
      const snapshot = await buildShareSnapshot(db, savedViews, share)
      if (!snapshot.pluginIds.includes(id)) {
        route.send(404, { error: 'not found' })
        return
      }
      const zip = zipSharePluginSource(process.cwd(), id)
      if (!zip) {
        route.send(404, { error: 'not found' })
        return
      }
      route.res.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${id}.zip"`,
        'cache-control': 'no-store',
      })
      route.res.end(Buffer.from(zip))
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('GET', '/api/db/facets', async (route) => {
    try {
      const collect = route.query.get('collect') || ''
      if (collect) {
        route.send(200, await db.collectFacet(collect))
        return
      }
      const q = route.query.get('q') || ''
      route.send(200, { facets: facets.list(q) })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/facets', async (route) => {
    try {
      const body = (await route.json()) as { facets?: unknown[] }
      facets.replace(Array.isArray(body.facets) ? body.facets : [])
      ctx.emit('database/change')
      route.send(200, { ok: true, facets: facets.list() })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/db/file/:name', async (route) => {
    try {
      const name = route.params.name ?? ''
      const { bytes, type, etag } = await assets.read(name)
      route.res.writeHead(200, {
        'content-type': type,
        'cache-control': isHashedAssetName(name) ? 'public, max-age=31536000, immutable' : 'no-store',
        etag: `"${etag}"`,
      })
      route.res.end(bytes)
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('PUT', '/api/db/file/:name', async (route) => {
    try {
      const written = await assets.write(route.params.name ?? '', await route.bytes())
      ctx.http.broadcast?.(DATABASE_CHANNEL, { ts: Date.now(), asset: { name: written.name, etag: written.etag } })
      route.send(200, { ok: true, ...written })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/action', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; action?: string; args?: unknown }
      const extra =
        body?.args && typeof body.args === 'object' && !Array.isArray(body.args)
          ? (body.args as Record<string, unknown>)
          : undefined
      route.send(200, await db.action(String(body?.path ?? ''), String(body?.action ?? ''), extra))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
}
