const ASSET_FILE_RE = /^[\p{L}\p{N}._-]+$/u
const ASSET_REF_RE = /(?:(?:\.page\/)?assets\/|\/api\/(?:page|db|doc)\/file\/)([\p{L}\p{N}._-]+)/gu

function baseName(name: string) {
  const normalized = name.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return slash >= 0 ? normalized.slice(slash + 1) : normalized
}

export function isCollectedAssetName(name: string) {
  const file = baseName(name)
  return Boolean(file) && file === name.replace(/\\/g, '/') && file !== '.gitkeep' && ASSET_FILE_RE.test(file)
}

export function collectAssetNamesFromText(text: string) {
  const names = new Set<string>()
  for (const match of String(text ?? '').matchAll(ASSET_REF_RE)) {
    const name = baseName(match[1] ?? '')
    if (isCollectedAssetName(name)) names.add(name)
  }
  return names
}
