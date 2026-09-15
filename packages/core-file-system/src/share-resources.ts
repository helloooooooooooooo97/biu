import { collectAssetNames } from './asset-refs.ts'

export type ShareResourceStats = {
  pages: number
  plugins: number
  collections: number
  pluginIds: string[]
}

const PLUGIN_ID_RE = /(?:^|[^\w-])plugin=([A-Za-z0-9][\w.-]{0,63})/g
const PAGE_MENTION_RE = /(?:^|[^\w/])page\/([A-Za-z0-9._-]+)/g
const FACET_MENTION_RE = /(?:^|[^\w/])facet\/([A-Za-z0-9._-]+)/g
const COLLECTION_PATH_RE = /\/(?:database\/)?(pages|tasks|facets|plugins)\b/g

export function isSharePluginId(id: string) {
  return /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(id)
}

export function mintSharePin() {
  const buf = new Uint32Array(1)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf)
  else buf[0] = Math.floor(Math.random() * 0xffffffff)
  return String(100000 + (buf[0]! % 900000))
}

export function shareResourceTypeCount(stats: Pick<ShareResourceStats, 'pages' | 'plugins' | 'collections'>) {
  return Number(stats.pages > 0) + Number(stats.plugins > 0) + Number(stats.collections > 0)
}

function eatMatches(text: string, re: RegExp, into: Set<string>) {
  re.lastIndex = 0
  for (const match of text.matchAll(re)) {
    const id = String(match[1] ?? '').trim()
    if (id) into.add(id)
  }
}

export function collectShareResources(
  records: Array<Record<string, unknown>>,
  contents: Record<string, unknown>,
  opts: { skipIds?: Iterable<string>; includeRecords?: boolean } | Iterable<string> = {},
): ShareResourceStats {
  const options = isSkipList(opts) ? { skipIds: opts } : opts
  const skipPages = new Set([...(options.skipIds ?? [])].map(String))
  const pages = new Set<string>()
  const plugins = new Set<string>()
  const collections = new Set<string>()
  if (options.includeRecords) {
    for (const row of records) {
      const id = String(row.id ?? '').trim()
      if (id) pages.add(id)
    }
  }
  const blobs: unknown[] = [...records, ...Object.values(contents)]
  for (const name of collectAssetNames(...blobs)) pages.add(name)
  for (const blob of blobs) {
    if (blob == null) continue
    const text = typeof blob === 'string' ? blob : JSON.stringify(blob)
    eatMatches(text, PLUGIN_ID_RE, plugins)
    eatMatches(text, PAGE_MENTION_RE, pages)
    eatMatches(text, FACET_MENTION_RE, collections)
    eatMatches(text, COLLECTION_PATH_RE, collections)
  }
  if (!options.includeRecords) {
    for (const id of skipPages) pages.delete(id)
  }
  collections.delete('pages')
  collections.delete('plugins')
  const pluginIds = [...plugins].filter(isSharePluginId).sort()
  return {
    pages: pages.size,
    plugins: pluginIds.length,
    collections: collections.size,
    pluginIds,
  }
}

function isSkipList(value: unknown): value is Iterable<string> {
  return Array.isArray(value)
}
