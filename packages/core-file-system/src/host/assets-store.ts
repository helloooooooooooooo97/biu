import { basename, join } from 'node:path'
import {
  ASSETS_ROOT,
  assetsRootPath,
  dataHome,
  isHashedAssetName,
  readContentAddressed,
  readDocument,
  writeContentAddressed,
  writeDocument,
} from '@biu/host-plugin-loader/data-dir'
import { collectAssetNames, isAssetFileName } from '../asset-refs.ts'

export { collectAssetNames, isAssetFileName } from '../asset-refs.ts'
export { isHashedAssetName, AssetConflictError, parseIfMatch } from '@biu/host-plugin-loader/data-dir'

export const FILE_SYSTEM_ASSETS = ASSETS_ROOT
export const FILE_SYSTEM_ASSET_PREFIX = '/api/db/file/'
export const FILE_SYSTEM_DOC_PREFIX = '/api/doc/file/'
export const ASSET_CHANGED_EVENT = 'biu:asset-changed'

export function assetHref(name: string) {
  return `${FILE_SYSTEM_ASSET_PREFIX}${encodeURIComponent(name)}`
}

export function docHref(name: string) {
  return `${FILE_SYSTEM_DOC_PREFIX}${encodeURIComponent(name)}`
}

export function mimeOfAsset(name: string) {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'))
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.json' || ext === '.excalidraw' || ext === '.timeline') return 'application/json; charset=utf-8'
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8'
  if (ext === '.txt' || ext === '.md') return 'text/plain; charset=utf-8'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.mp4') return 'video/mp4'
  return 'application/octet-stream'
}

export class FileSystemAssets {
  constructor(private dir = assetsRootPath(dataHome())) {}

  root() {
    return this.dir
  }

  casRoot() {
    return join(this.dir, 'cas')
  }

  docRoot() {
    return join(this.dir, 'doc')
  }

  async write(name: string, content: string | Buffer | Uint8Array) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/') || !isAssetFileName(file)) throw new Error('invalid asset')
    const written = await writeContentAddressed(this.casRoot(), file, content)
    return { name: written.name, href: assetHref(written.name), etag: written.etag, bytes: written.bytes.length, storage: 'cas' as const }
  }

  async writeDoc(name: string, content: string | Buffer | Uint8Array, opts?: { etag?: string }) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/') || !isAssetFileName(file)) throw new Error('invalid asset')
    const written = await writeDocument(this.docRoot(), file, content, opts)
    return { name: written.name, href: docHref(written.name), etag: written.etag, bytes: written.bytes.length, storage: 'doc' as const }
  }

  async read(name: string) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
    const { bytes } = await readContentAddressed(this.casRoot(), file)
    return { bytes, type: mimeOfAsset(file), etag: file, storage: 'cas' as const }
  }

  async readDoc(name: string) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
    const { bytes, etag } = await readDocument(this.docRoot(), file)
    return { bytes, type: mimeOfAsset(file), etag, storage: 'doc' as const }
  }

  async readAny(name: string) {
    const file = basename(name)
    if (isHashedAssetName(file)) {
      try {
        return await this.read(file)
      } catch {
        /* fall through to doc */
      }
    }
    try {
      return await this.readDoc(file)
    } catch {
      return this.read(file)
    }
  }
}
