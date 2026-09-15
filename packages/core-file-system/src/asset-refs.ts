/** Browser-safe asset name helpers. Do not import host / node:fs from here. */

const ASSET_FILE_RE = /^[\p{L}\p{N}._-]+$/u
const ASSET_REF_RE = /(?:(?:\.page\/)?assets\/|\/api\/(?:page|db)\/file\/)([\p{L}\p{N}._-]+)/gu

function baseName(name: string) {
  const normalized = name.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return slash >= 0 ? normalized.slice(slash + 1) : normalized
}

export function isAssetFileName(name: string) {
  const file = baseName(name)
  return Boolean(file) && file === name.replace(/\\/g, '/') && file !== '.gitkeep' && ASSET_FILE_RE.test(file)
}

export function collectAssetNames(...chunks: unknown[]): Set<string> {
  const names = new Set<string>()
  const eat = (text: string) => {
    for (const match of text.matchAll(ASSET_REF_RE)) {
      const name = baseName(match[1] ?? '')
      if (isAssetFileName(name)) names.add(name)
    }
  }
  for (const chunk of chunks) {
    if (chunk == null) continue
    if (typeof chunk === 'string') eat(chunk)
    else eat(JSON.stringify(chunk))
  }
  return names
}
