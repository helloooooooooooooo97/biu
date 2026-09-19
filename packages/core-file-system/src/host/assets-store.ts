import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { DATA_DIR_NAME, dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'
import { collectAssetNames, isAssetFileName } from '../asset-refs.ts'

export { collectAssetNames, isAssetFileName } from '../asset-refs.ts'

export const FILE_SYSTEM_ASSETS = `${DATA_DIR_NAME}/assets`
export const FILE_SYSTEM_ASSET_PREFIX = '/api/db/file/'
export const ASSET_CHANGED_EVENT = 'biu:asset-changed'

export class AssetConflictError extends Error {
  readonly etag: string
  constructor(etag: string) {
    super('etag conflict')
    this.name = 'AssetConflictError'
    this.etag = etag
  }
}

export function assetHref(name: string) {
  return `${FILE_SYSTEM_ASSET_PREFIX}${encodeURIComponent(name)}`
}

export function mimeOfAsset(name: string) {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'))
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.txt' || ext === '.md') return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

export function bytesEtag(bytes: Buffer) {
  return createHash('sha1').update(bytes).digest('hex').slice(0, 16)
}

export function parseIfMatch(raw: unknown) {
  const text = String(raw ?? '').trim().replace(/^W\//, '').replaceAll('"', '')
  return text && text !== '*' ? text : ''
}

export class FileSystemAssets {
  constructor(private dir = dataPath(dataHome(), 'assets')) {}

  root() {
    return this.dir
  }

  async write(name: string, content: string | Buffer | Uint8Array, opts?: { etag?: string }) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/') || !isAssetFileName(file)) throw new Error('invalid asset')
    await mkdir(this.dir, { recursive: true })
    const next = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
    const expected = parseIfMatch(opts?.etag)
    let current = ''
    try {
      current = bytesEtag(await readFile(join(this.dir, file)))
    } catch {
      current = ''
    }
    if (current) {
      if (!expected) throw new AssetConflictError(current)
      if (expected !== current) throw new AssetConflictError(current)
    } else if (expected) {
      throw new AssetConflictError('')
    }
    await writeFile(join(this.dir, file), next)
    return { name: file, href: assetHref(file), etag: bytesEtag(next) }
  }

  async read(name: string, fallbackDirs: string[] = []) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
    const dirs = [this.dir, ...fallbackDirs]
    let last: unknown
    for (const dir of dirs) {
      try {
        const bytes = await readFile(join(dir, file))
        return { bytes, type: mimeOfAsset(file), etag: bytesEtag(bytes) }
      } catch (error) {
        last = error
      }
    }
    throw last instanceof Error ? last : new Error('not found')
  }
}
