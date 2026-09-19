/** Shared asset URL helpers. No node / host imports. */

const ASSET_FILE_RE = /^[\p{L}\p{N}._-]+$/u

function baseName(name: string) {
  const normalized = name.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return slash >= 0 ? normalized.slice(slash + 1) : normalized
}

export function isAssetFileName(name: string) {
  const file = baseName(name)
  return Boolean(file) && file === name.replace(/\\/g, '/') && file !== '.gitkeep' && ASSET_FILE_RE.test(file)
}

export function assetNameFromUrl(url: string): string | null {
  const raw = String(url ?? '').trim()
  if (!raw) return null
  const decoded = (() => {
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })()
  const hit =
    /^(?:\.page\/)?assets\/(.+)$/.exec(decoded) ?? /^\/api\/(?:page|db|doc)\/file\/(.+)$/.exec(decoded)
  if (!hit) return null
  const name = baseName(hit[1] ?? '')
  return isAssetFileName(name) ? name : null
}

export function assetNamesFromMarkdown(md: string): Set<string> {
  const out = new Set<string>()
  const push = (raw: string) => {
    const name = assetNameFromUrl(raw)
    if (name) out.add(name)
  }
  const text = String(md ?? '')
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) push(match[1] ?? '')
  for (const name of assetNamesFromHtml(text)) out.add(name)
  return out
}

export function assetNamesFromHtml(html: string): Set<string> {
  const out = new Set<string>()
  for (const match of String(html ?? '').matchAll(/<(?:img|a|source|video|audio)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const name = assetNameFromUrl(match[1] ?? '')
    if (name) out.add(name)
  }
  return out
}

export type BlockAssetsDecl = string[] | ((data: Record<string, unknown>) => Iterable<string>)

const blockAssets = new Map<string, BlockAssetsDecl>()

function blockKey(kind: string, plugin: string) {
  return `${String(plugin ?? '').trim()}::${String(kind ?? '').trim()}`
}

export function registerBlockAssets(kind: string, plugin: string, assets: BlockAssetsDecl) {
  blockAssets.set(blockKey(kind, plugin), assets)
}

export function lookupBlockAssets(kind: string, plugin: string) {
  ensureDefaultBlockAssets()
  return blockAssets.get(blockKey(kind, plugin))
}

function videoFieldAssets(data: Record<string, unknown>) {
  const out = new Set<string>()
  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return
    const direct = assetNameFromUrl(raw)
    if (direct) out.add(direct)
    for (const name of assetNamesFromMarkdown(raw)) out.add(name)
    for (const match of raw.matchAll(/\bsrc=(?:["']?)([^"'\s>]+)/gi)) {
      const name = assetNameFromUrl(match[1] ?? '') ?? assetNameFromUrl(`assets/${baseName(match[1] ?? '')}`)
      if (name) out.add(name)
    }
  }
  push(data.bgm)
  push(data.file)
  push(data.script)
  if (Array.isArray(data.tracks)) {
    for (const track of data.tracks) {
      if (track && typeof track === 'object') push((track as { src?: unknown }).src)
    }
  }
  return out
}

let defaultsReady = false
function ensureDefaultBlockAssets() {
  if (defaultsReady) return
  defaultsReady = true
  registerBlockAssets('excalidraw', 'page-excalidraw', ['file'])
  registerBlockAssets('video', 'page-video', videoFieldAssets)
  registerBlockAssets('algorithm', 'page-algorithm', [])
  registerBlockAssets('terminal', 'page-terminal', [])
  registerBlockAssets('browser', 'page-browser', [])
  registerBlockAssets('code-run', 'page-code-runner', [])
}

export function assetNamesFromBlock(kind: string, plugin: string, data: unknown): Set<string> {
  const spec = lookupBlockAssets(kind, plugin)
  if (spec == null) return new Set()
  const rec = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  const values = typeof spec === 'function' ? [...spec(rec)] : spec.map((key) => rec[key])
  const out = new Set<string>()
  const push = (value: unknown) => {
    if (value instanceof Set) {
      for (const item of value) push(item)
      return
    }
    if (typeof value !== 'string') return
    const name = assetNameFromUrl(value) ?? (isAssetFileName(value) ? value : null)
    if (name) out.add(name)
  }
  for (const value of values) push(value)
  return out
}

/** Walk strings as markdown / html / exact asset URLs. Does not substring-match prose. */
export function collectAssetNames(...chunks: unknown[]): Set<string> {
  const names = new Set<string>()
  const walk = (value: unknown) => {
    if (value == null) return
    if (typeof value === 'string') {
      for (const name of assetNamesFromMarkdown(value)) names.add(name)
      const exact = assetNameFromUrl(value)
      if (exact) names.add(exact)
      const trimmed = value.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          walk(JSON.parse(trimmed) as unknown)
        } catch {
          /* not JSON */
        }
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) walk(item)
    }
  }
  for (const chunk of chunks) walk(chunk)
  return names
}
