import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import { collectAssetNames } from './asset-refs.ts'
import type { SavedView } from './web/saved-view.ts'

export type ShareKind = 'view' | 'record'

export type ShareRecord = {
  token: string
  kind: ShareKind
  collection: string
  viewId: string
  recordId: string
  hasPassword: boolean
  sharePlugins: boolean
  allowCopy: boolean
  createdAt: number
  updatedAt: number
}

export type ShareSnapshot = {
  kind: ShareKind
  collection: string
  viewId: string
  recordId: string
  title: string
  collectionLabel: string
  schema: CollectionSchema
  view?: Partial<SavedView>
  records: DbRecord[]
  contents: Record<string, unknown>
  assets: string[]
  banner?: unknown
  resources: {
    pages: number
    plugins: number
    collections: number
  }
  pluginIds: string[]
  sharePlugins: boolean
  allowCopy: boolean
  owner?: { name: string; avatar: string; slogan?: string }
}

export function freezeSchema(schema: CollectionSchema): CollectionSchema {
  const fields = { ...schema.fields }
  for (const [key, field] of Object.entries(fields)) {
    fields[key] = { ...field, writable: false }
  }
  return { ...schema, fields, records: {} }
}

export function sharePublicPath(token: string, recordId?: string) {
  const base = `/share/${encodeURIComponent(token)}`
  return recordId ? `${base}/r/${encodeURIComponent(recordId)}` : base
}

export function parseSharePath(pathname: string): { token: string; recordId: string } | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  const match = path.match(/^\/share\/([^/]+)(?:\/r\/([^/]+))?$/)
  if (!match?.[1]) return null
  return {
    token: decodeURIComponent(match[1]),
    recordId: match[2] ? decodeURIComponent(match[2]) : '',
  }
}

export function pickShareAssets(records: DbRecord[], contents: Record<string, unknown>) {
  return [...collectAssetNames(...records, ...Object.values(contents))]
}

export function shareTargetKey(share: Pick<ShareRecord, 'kind' | 'collection' | 'viewId' | 'recordId'>) {
  return `${share.kind}:${share.collection}:${share.viewId}:${share.recordId}`
}
